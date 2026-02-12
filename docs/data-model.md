# Data model

Проект использует Firestore с текущей структурой (без изменений):

## Collections

1. `lists/{listId}`
- `name: string`
- `members: string[]` (email-адреса)
- `items: Record<string, Item> | Item[]`

`Item`:
- `id: string | number`
- `name: string`
- `bought: boolean`
- `category: string`
- `active: boolean`

2. `shopping/catalog`
- `entries: CatalogEntry[] | Record<string, CatalogEntry>`

`CatalogEntry`:
- `name: string`
- `category: string`

3. `users/{encodedEmail}`
- `email: string`
- `name: string`
- `updatedAt: number`

`encodedEmail` формируется через `encodeEmailKey(email)` (точки заменяются на запятые).

## Client-side notes

- Активный пользователь хранится в `localStorage` по ключу `shoppingListApp.currentUser`.
- Приложение использует анонимную Firebase Auth для доступа к Firestore.
- Формат документов и поля должны оставаться совместимыми с текущим клиентом.
