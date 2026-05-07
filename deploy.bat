@echo off
title Orion 2 - Auto Deploy
echo [1/3] Adicionando arquivos...
git add .

echo [2/3] Gravando alteracoes...
git commit -m "🚀 Orion Auto-Update"

echo [3/3] Enviando para o GitHub...
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERRO: O envio falhou! Verifique a mensagem acima.
    pause
) else (
    echo.
    echo ✨ SUCESSO! O deploy iniciou no GitHub.
    timeout /t 5
)
