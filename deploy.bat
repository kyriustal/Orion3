@echo off
setlocal enabledelayedexpansion
title Orion 2 - GitHub Sync
echo ==================================================
echo           ORION 2 - SINCRONIZAÇÃO GITHUB
echo ==================================================
echo.

:: 1. Preparação Git
echo [STEP 1] Adicionando arquivos...
git add .

:: 2. Commit
echo.
set /p commit_msg="Digite a descricao das alteracoes (ou Enter para padrao): "
if "!commit_msg!"=="" set commit_msg="🚀 Deploy Orion 2: Stable Version"

echo.
echo [STEP 2] Criando Commit...
git commit -m "!commit_msg!"

:: 3. Push (Isso vai disparar o deploy automático no GitHub)
echo.
echo [STEP 3] Enviando para o GitHub (O deploy iniciará automaticamente)...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ⚠️ Falha no push. Verifique sua conexão ou se há conflitos.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ==================================================
echo    ✨ SINCRONIZADO COM SUCESSO!
echo    O GitHub Actions iniciará o build e o upload
echo    para a Hostinger em alguns instantes.
echo.
echo    Acompanhe em: https://github.com/kyriustal/Orion3/actions
echo ==================================================
echo.
pause
