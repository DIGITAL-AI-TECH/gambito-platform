# Gambito — Plataforma de Torneios de Xadrez

Plataforma SaaS para gestão de torneios de xadrez com suporte a Swiss (Dutch FIDE C.04.3), Round Robin (Berger), Elo FIDE e 10 critérios de desempate.

## Stack

Single-file HTML application (~2700 lines). Zero dependencies. Pure vanilla JS.

## Acesso

Credenciais hardcoded no array `USERS` dentro do `index.html`. Para adicionar novos usuários, editar o array diretamente.

## Deploy

Cloudflare Pages — `gambito.digital-ai.tech`

