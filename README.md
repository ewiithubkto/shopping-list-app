# shopping-list-app

React + Vite + Firebase приложение для совместных списков покупок.

## Requirements

- Node.js 18+
- npm 9+

## Scripts

- `npm run dev` — запуск локальной разработки (Vite dev server)
- `npm run build` — production build
- `npm run preview` — просмотр production build локально
- `npm run lint` — проверка ESLint

## Run locally

1. `npm install`
2. `npm run dev`

## Data model and Firestore

- Текущая клиентская модель данных: `docs/data-model.md`
- Заглушка для правил безопасности Firestore: `firestore.rules`

## Notes

Firebase Web API key в клиентском приложении не является секретом, но безопасность доступа определяется Firestore Rules.
