@echo off
title Orion - Auto Deploy
echo ===========================================
echo            ORION - AUTO DEPLOY
echo ===========================================

echo.
echo [1/4] Adicionando arquivos alterados...
git add .

echo.
echo [2/4] Gravando alteracoes...
git commit -m "🚀 Orion Auto-Update" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo    ✓ Alteracoes gravadas localmente.
) else (
    echo    ℹ Nenhuma alteracao nova para gravar.
)

echo.
echo [3/4] Sincronizando com o GitHub...
git pull origin main --rebase >nul 2>&1

echo.
echo [4/4] Enviando para o GitHub (Disparando deploy na Hostinger)...
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo -------------------------------------------
    echo ❌ ERRO: O envio para o GitHub falhou!
    echo Verifique sua conexao ou as permissoes do Git.
    echo -------------------------------------------
    pause
) else (
    echo.
    echo -------------------------------------------
    echo ✨ SUCESSO! O codigo foi enviado ao GitHub.
    echo 🚀 O deploy automatico para a Hostinger foi iniciado.
    echo -------------------------------------------
    ping 127.0.0.1 -n 6 >nul
)
