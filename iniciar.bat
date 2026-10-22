@echo off
chcp 65001 >nul
title Helio Store
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Instalando dependencias, aguarde...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando Helio Store...
call npx electron .
if errorlevel 1 pause
