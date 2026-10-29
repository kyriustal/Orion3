@echo off
setlocal enabledelayedexpansion
title Orion 2 - Build e Deploy Hostinger

echo ===================================================
echo           ORION 2 - BUILD & AUTO DEPLOY
echo ===================================================
echo Data e Hora: %DATE% %TIME%
echo.

:: 1. Compilacao do Projeto
echo [1/5] Compilando Frontend e Backend para Producao...
echo       - Executando: npm run build
call cmd.exe /c "npm run build"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ===================================================
    echo [ERRO] A compilacao falhou! O deploy foi cancelado
    echo para evitar enviar codigo com erros para a Hostinger.
    echo ===================================================
    pause
    exit /b %ERRORLEVEL%
)
echo       [OK] Frontend (dist/) e Backend (dist-server/) compilados com sucesso!

:: 2. Sinal de Reinicializacao do Node.js na Hostinger
echo.
echo [2/5] Gerando sinal de reinicializacao para a Hostinger (tmp/restart.txt)...
if not exist "tmp" mkdir "tmp"
echo Restart signal: %DATE% %TIME% > tmp\restart.txt
echo       [OK] Sinal tmp/restart.txt atualizado.

:: 3. Preparando Arquivos para Git
echo.
echo [3/5] Adicionando arquivos alterados e pastas compiladas...
git add -A
git add -f dist dist-server tmp/restart.txt

:: 4. Gravando Alteracoes
echo.
echo [4/5] Gravando versao local...
git commit -m "🚀 Orion Auto-Deploy: %DATE% %TIME%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo       [OK] Nova versao gravada com sucesso.
) else (
    echo       [INFO] Nenhuma alteracao de codigo nova para gravar.
)

:: 5. Sincronizacao e Envio para o GitHub
echo.
echo [5/5] Enviando atualizacao para o GitHub (Main)...
git pull origin main --rebase >nul 2>&1
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ===================================================
    echo [ERRO] O envio para o GitHub falhou!
    echo Verifique sua conexao com a internet ou permissoes.
    echo ===================================================
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo [SUCESSO] Build concluido e enviado ao GitHub!
echo.
echo O codigo compilado (dist/ e dist-server/) esta pronto
echo e o sinal de reinicializacao do Node.js foi disparado.
echo ===================================================
echo Fechando em 5 segundos...
ping 127.0.0.1 -n 6 >nul
