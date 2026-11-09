@echo off
chcp 65001 > nul
title MOTION TENNIS - Iniciar Plataforma

echo ====================================================
echo        🎾 MOTION TENNIS - INICIALIZAÇÃO LOCAL
echo ====================================================
echo.

set "LOCAL_NODE=%LOCALAPPDATA%\Programs\nodejs"
if exist "%LOCAL_NODE%\node.exe" (
    set "PATH=%LOCAL_NODE%;%PATH%"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js não foi encontrado no PATH nem em %LOCAL_NODE%.
    echo Por favor, verifique a instalação do Node.js.
    pause
    exit /b 1
)

echo [1/3] Verificando dependências do servidor...
if not exist "node_modules" (
    echo Instalando pacotes...
    call npm install
)

echo [2/3] Iniciando servidor Motion Tennis em http://localhost:3000 ...
start "" /b node server/index.js

echo [3/3] Aguardando inicialização do servidor...
powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

echo.
echo ====================================================
echo  🎾 Motion Tennis está rodando em http://localhost:3000
echo  Para encerrar o servidor, feche esta janela.
echo ====================================================
echo.

pause
