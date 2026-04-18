import requests
import time
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from passlib.context import CryptContext

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

BASE_URL = f"https://api.telegram.org/bot{TOKEN}"

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

user_states = {}

def send_message(chat_id, text):
    url = f"{BASE_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=30)
    except Exception as e:
        print(f"Ошибка отправки: {e}")

def get_updates(offset=None):
    url = f"{BASE_URL}/getUpdates"
    params = {"timeout": 30}
    if offset:
        params["offset"] = offset
    try:
        response = requests.get(url, params=params, timeout=30)
        return response.json().get("result", [])
    except Exception as e:
        print(f"Ошибка: {e}")
        return []

def handle_start(chat_id):
    send_message(chat_id, 
        "🎯 *Job Tracker Bot*\n\n"
        "Команды:\n"
        "/add - добавить вакансию\n"
        "/list - список вакансий\n"
        "/stats - статистика\n"
        "/link - привязать аккаунт\n"
        "/help - помощь")

def handle_link(chat_id, user_id):
    user_states[user_id] = {"step": "linking"}
    send_message(chat_id, "🔗 Введите *username* и *пароль* через пробел:\nПример: `alex 123456`")

def handle_add(chat_id, user_id):
    db = SessionLocal()
    user = db.query(models.User).filter(models.User.telegram_id == user_id).first()
    db.close()
    
    if not user:
        send_message(chat_id, "❌ Сначала привяжите аккаунт: /link")
        return
    
    user_states[user_id] = {"step": "company"}
    send_message(chat_id, "🏢 Введите название компании:")

def handle_list(chat_id, user_id):
    db = SessionLocal()
    user = db.query(models.User).filter(models.User.telegram_id == user_id).first()
    
    if not user:
        send_message(chat_id, "❌ Сначала /link")
        db.close()
        return
    
    vacancies = db.query(models.Vacancy).filter(models.Vacancy.owner_id == user.id).all()
    db.close()
    
    if not vacancies:
        send_message(chat_id, "📭 Нет вакансий")
        return
    
    for v in vacancies[:10]:
        send_message(chat_id, 
            f"📌 *{v.company}* — {v.position}\n"
            f"Статус: {v.status}\n"
            f"📅 {v.applied_at.strftime('%d.%m.%Y')}")

def handle_stats(chat_id, user_id):
    db = SessionLocal()
    user = db.query(models.User).filter(models.User.telegram_id == user_id).first()
    
    if not user:
        send_message(chat_id, "❌ Сначала /link")
        db.close()
        return
    
    vacancies = db.query(models.Vacancy).filter(models.Vacancy.owner_id == user.id).all()
    db.close()
    
    total = len(vacancies)
    applied = sum(1 for v in vacancies if v.status == "applied")
    interview = sum(1 for v in vacancies if v.status == "interview")
    offer = sum(1 for v in vacancies if v.status == "offer")
    rejected = sum(1 for v in vacancies if v.status == "rejected")
    accepted = sum(1 for v in vacancies if v.status == "accepted")
    
    send_message(chat_id,
        f"📊 *Статистика*\n\n"
        f"Всего: {total}\n"
        f"Отклики: {applied}\n"
        f"Собеседования: {interview}\n"
        f"Офферы: {offer}\n"
        f"Принято: {accepted}\n"
        f"Отказы: {rejected}")

def handle_help(chat_id):
    send_message(chat_id,
        "📚 *Команды:*\n\n"
        "/start — начать\n"
        "/link — привязать аккаунт\n"
        "/add — добавить вакансию\n"
        "/list — список вакансий\n"
        "/stats — статистика")

def handle_text(chat_id, user_id, text):
    if user_id not in user_states:
        send_message(chat_id, "Используйте /add или /link")
        return
    
    state = user_states[user_id]
    step = state.get("step")
    
    if step == "linking":
        parts = text.split()
        if len(parts) >= 2:
            username = parts[0]
            password = " ".join(parts[1:])
            
            db = SessionLocal()
            user = db.query(models.User).filter(models.User.username == username).first()
            
            if not user:
                send_message(chat_id, "❌ Пользователь не найден")
                del user_states[user_id]
                db.close()
                return
            
            if not verify_password(password, user.hashed_password):
                send_message(chat_id, "❌ Неверный пароль")
                del user_states[user_id]
                db.close()
                return
            
            user.telegram_id = user_id
            db.commit()
            db.close()
            
            send_message(chat_id, "✅ Аккаунт привязан! Используйте /add")
            del user_states[user_id]
        else:
            send_message(chat_id, "❌ Формат: username пароль")
        return
    
    if step == "company":
        state["company"] = text
        state["step"] = "position"
        send_message(chat_id, "📌 Должность:")
    elif step == "position":
        state["position"] = text
        state["step"] = "salary"
        send_message(chat_id, "💰 Зарплата (или '-'):")
    elif step == "salary":
        if text != "-":
            state["salary"] = text
        state["step"] = "url"
        send_message(chat_id, "🔗 Ссылка (или '-'):")
    elif step == "url":
        if text != "-":
            state["url"] = text
        state["step"] = "notes"
        send_message(chat_id, "📝 Заметки (или '-'):")
    elif step == "notes":
        if text != "-":
            state["notes"] = text
        
        db = SessionLocal()
        user = db.query(models.User).filter(models.User.telegram_id == user_id).first()
        
        if not user:
            send_message(chat_id, "❌ Аккаунт не привязан")
            del user_states[user_id]
            db.close()
            return
        
        vacancy = models.Vacancy(
            company=state.get("company"),
            position=state.get("position"),
            salary=state.get("salary"),
            url=state.get("url"),
            notes=state.get("notes"),
            owner_id=user.id
        )
        db.add(vacancy)
        db.commit()
        db.close()
        
        send_message(chat_id, f"✅ Вакансия добавлена!\n🏢 {state.get('company')}\n💼 {state.get('position')}")
        del user_states[user_id]

def main():
    if not TOKEN:
        print("❌ Токен не найден!")
        return
    
    print("🤖 Бот запущен...")
    last_update_id = 0
    
    while True:
        try:
            updates = get_updates(last_update_id + 1)
            for update in updates:
                last_update_id = update["update_id"]
                if "message" in update:
                    message = update["message"]
                    chat_id = message["chat"]["id"]
                    user_id = message["from"]["id"]
                    text = message.get("text", "")
                    
                    print(f"Получено: {text}")
                    
                    if text == "/start":
                        handle_start(chat_id)
                    elif text == "/link":
                        handle_link(chat_id, user_id)
                    elif text == "/add":
                        handle_add(chat_id, user_id)
                    elif text == "/list":
                        handle_list(chat_id, user_id)
                    elif text == "/stats":
                        handle_stats(chat_id, user_id)
                    elif text == "/help":
                        handle_help(chat_id)
                    elif text.startswith("/"):
                        send_message(chat_id, "❌ Неизвестная команда")
                    else:
                        handle_text(chat_id, user_id, text)
            time.sleep(1)
        except Exception as e:
            print(f"Ошибка: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()