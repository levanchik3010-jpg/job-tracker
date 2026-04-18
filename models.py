from sqlalchemy import Column, Integer, String, DateTime, Text, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import enum

class VacancyStatus(str, enum.Enum):
    APPLIED = "applied"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"
    ACCEPTED = "accepted"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, nullable=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    vacancies = relationship("Vacancy", back_populates="owner", cascade="all, delete-orphan")

class Vacancy(Base):
    __tablename__ = "vacancies"
    
    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(100), nullable=False)
    position = Column(String(100), nullable=False)
    salary = Column(String(100), nullable=True)
    url = Column(String(500), nullable=True)
    status = Column(Enum(VacancyStatus), default=VacancyStatus.APPLIED)
    notes = Column(Text, nullable=True)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="vacancies")