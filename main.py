from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from database import get_db, engine, Base
import models
from auth import get_current_user, create_access_token, verify_password, get_password_hash
from pydantic import BaseModel as PydanticBaseModel
from typing import Optional
from datetime import datetime, timedelta
import csv
import io

# Создаём таблицы
Base.metadata.create_all(bind=engine)

# Создаём приложение
app = FastAPI(title="Job Tracker")
from fastapi.staticfiles import StaticFiles

app.mount("/static", StaticFiles(directory="static"), name="static")
# Подключаем шаблоны
templates = Jinja2Templates(directory="templates")

# ========== ВЕБ-ИНТЕРФЕЙС ==========

@app.get("/")
def home():
    return HTMLResponse("""
    <h1>🎯 Job Tracker API</h1>
    <p>Перейдите на <a href="/app">/app</a> для работы с приложением</p>
    <p>Документация API: <a href="/docs">/docs</a></p>
    """)

@app.get("/app")
def web_interface(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ========== SCHEMAS ==========

class UserRegister(PydanticBaseModel):
    username: str
    email: str
    password: str

class UserLogin(PydanticBaseModel):
    username: str
    password: str

class VacancyCreate(PydanticBaseModel):
    company: str
    position: str
    salary: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None

class VacancyUpdate(PydanticBaseModel):
    status: str
    notes: Optional[str] = None

# ========== API ENDPOINTS ==========

@app.post("/api/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    
    hashed = get_password_hash(user.password)
    db_user = models.User(username=user.username, email=user.email, hashed_password=hashed)
    db.add(db_user)
    db.commit()
    return {"success": True, "message": "Регистрация успешна"}

@app.post("/api/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверные данные")
    
    token = create_access_token(data={"sub": str(db_user.id)})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/api/vacancies")
def get_vacancies(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    vacancies = db.query(models.Vacancy).filter(models.Vacancy.owner_id == current_user.id).all()
    return vacancies

@app.post("/api/vacancies")
def create_vacancy(v: VacancyCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    vacancy = models.Vacancy(**v.dict(), owner_id=current_user.id)
    db.add(vacancy)
    db.commit()
    db.refresh(vacancy)
    return vacancy

@app.put("/api/vacancies/{vacancy_id}")
def update_vacancy(vacancy_id: int, update: VacancyUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    vacancy = db.query(models.Vacancy).filter(
        models.Vacancy.id == vacancy_id,
        models.Vacancy.owner_id == current_user.id
    ).first()
    if not vacancy:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    
    vacancy.status = update.status
    if update.notes:
        vacancy.notes = update.notes
    vacancy.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}

@app.delete("/api/vacancies/{vacancy_id}")
def delete_vacancy(vacancy_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    vacancy = db.query(models.Vacancy).filter(
        models.Vacancy.id == vacancy_id,
        models.Vacancy.owner_id == current_user.id
    ).first()
    if not vacancy:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    
    db.delete(vacancy)
    db.commit()
    return {"success": True}

@app.get("/api/expired")
def get_expired_vacancies(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    threshold = datetime.utcnow() - timedelta(days=14)
    expired = db.query(models.Vacancy).filter(
        models.Vacancy.owner_id == current_user.id,
        models.Vacancy.updated_at < threshold,
        models.Vacancy.status.in_(["applied", "interview"])
    ).all()
    return expired

@app.get("/api/export/csv")
def export_csv(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    vacancies = db.query(models.Vacancy).filter(models.Vacancy.owner_id == current_user.id).all()
    
    # Используем правильный CSV формат с разделителем ";" для Excel
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_ALL)
    
    # Заголовки
    writer.writerow(["Компания", "Должность", "Зарплата", "Статус", "Дата", "Заметки"])
    
    status_names = {
        "applied": "Отклик",
        "interview": "Собеседование",
        "offer": "Оффер",
        "rejected": "Отказ",
        "accepted": "Принят"
    }
    
    for v in vacancies:
        writer.writerow([
            v.company,
            v.position,
            v.salary or "",
            status_names.get(v.status, v.status),
            v.applied_at.strftime("%Y-%m-%d"),
            v.notes or ""
        ])
    
    # Добавляем BOM для правильной кодировки в Excel
    content = output.getvalue().encode("utf-8-sig")
    
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=vacancies.csv"}
    )