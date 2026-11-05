# MINI SUS

Projeto multiplayer social deduction mobile-first em português.

## Stack
- Cliente: React + TypeScript + Vite + Phaser 3
- Servidor: Node.js + Express + Socket.IO
- Banco: PostgreSQL (Prisma)
- Deploy: Render (Blueprint) e GitHub

## Rodar localmente
1. Instale Node.js 20+ e PostgreSQL.
2. Copie `server/.env.example` para `server/.env` e configure `DATABASE_URL` e `JWT_SECRET`.
3. Na raiz: `npm install`
4. `npm run db:push --workspace server`
5. `npm run dev`

Cliente: http://localhost:5173  
Servidor: http://localhost:3000

## Deploy no Render
1. Envie todo o conteúdo deste ZIP para um repositório GitHub.
2. No Render, escolha **New > Blueprint** e selecione o repositório.
3. O `render.yaml` cria o PostgreSQL e o serviço web.
4. Configure `CLIENT_ORIGIN` com a URL pública do cliente se separar os serviços.

## O que já está implementado
- Cadastro/login com senha criptografada e JWT.
- Perfil de jogador e lista de amigos (adicionar/listar).
- Salas multiplayer via Socket.IO, códigos de sala e entrada/saída.
- Partidas de 4 a 15 jogadores, atribuição de impostor, tarefas simples, sabotagem, reunião e votação.
- Cliente responsivo para celular com Phaser 3 como camada de jogo.
- Persistência de usuários e amizades no PostgreSQL via Prisma.

## Limites desta versão
É uma base jogável de MVP, não uma produção comercial pronta. Os mapas são arenas simples, tarefas são interações básicas e ainda faltam moderação avançada, recuperação de conta por e-mail, anti-cheat robusto, testes de carga e publicação nas lojas. Faça testes com amigos antes de divulgar publicamente.
