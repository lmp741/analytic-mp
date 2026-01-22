# Инструкция по деплою на Vercel

## Подготовка

### 1. Проверьте .env.local

Убедитесь, что файл `.env.local` содержит:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Важно:** Эти переменные должны быть добавлены в Vercel как Environment Variables.

### 2. Убедитесь, что Supabase настроен

- Выполнены все миграции из `supabase/migrations/`
- RLS policies активны
- Settings row (id=1) существует

## Деплой через Vercel Dashboard

### Шаг 1: Подключение репозитория

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите "Add New Project"
3. Подключите ваш Git репозиторий (GitHub/GitLab/Bitbucket)
4. Выберите проект `Analytic_MP`

### Шаг 2: Настройка проекта

Vercel автоматически определит Next.js проект. Настройки:

- **Framework Preset:** Next.js (автоматически)
- **Root Directory:** `./` (по умолчанию)
- **Build Command:** `npm run build` (автоматически)
- **Output Directory:** `.next` (автоматически)
- **Install Command:** `npm install` (автоматически)

### Шаг 3: Добавление Environment Variables

**КРИТИЧЕСКИ ВАЖНО!** Добавьте переменные окружения:

1. В разделе "Environment Variables" добавьте:

   ```
   NEXT_PUBLIC_SUPABASE_URL = ваш_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY = ваш_supabase_anon_key
   ```

2. Выберите окружения:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

3. Нажмите "Save"

### Шаг 4: Деплой

1. Нажмите "Deploy"
2. Vercel автоматически:
   - Установит зависимости (`npm install`)
   - Соберет проект (`npm run build`)
   - Задеплоит приложение

### Шаг 5: Проверка

После деплоя:
1. Откройте URL вашего проекта
2. Проверьте, что приложение загружается
3. Попробуйте загрузить тестовый файл на `/upload`

## Деплой через Vercel CLI (альтернатива)

Если предпочитаете CLI:

```bash
# Установите Vercel CLI глобально
npm i -g vercel

# Логин
vercel login

# Деплой (первый раз)
vercel

# Деплой в production
vercel --prod
```

При первом деплое CLI спросит:
- Link to existing project? → No (для первого раза)
- Project name? → analytic-mp (или ваш выбор)
- Directory? → ./
- Override settings? → No

Затем добавьте переменные окружения через Dashboard или CLI:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Автоматический деплой

После подключения репозитория:
- Каждый push в `main`/`master` → автоматический production деплой
- Pull requests → автоматический preview деплой

## Troubleshooting

### Ошибка: "Environment variables not found"

**Решение:** Убедитесь, что переменные добавлены в Vercel Dashboard → Settings → Environment Variables

### Ошибка: "Build failed"

**Решение:**
1. Проверьте логи сборки в Vercel Dashboard
2. Убедитесь, что все зависимости в `package.json`
3. Проверьте, что TypeScript компилируется без ошибок локально

### Ошибка: "Supabase connection failed"

**Решение:**
1. Проверьте, что `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` правильные
2. Убедитесь, что RLS policies настроены правильно
3. Проверьте, что миграции выполнены

### Ошибка: "Module not found"

**Решение:**
1. Убедитесь, что все зависимости в `package.json`
2. Запустите `npm install` локально и проверьте, что нет ошибок
3. Проверьте, что нет проблем с путями импортов

## Полезные команды

```bash
# Проверить локальную сборку перед деплоем
npm run build

# Проверить линтер
npm run lint

# Запустить локально с production build
npm run build
npm run start
```

## После деплоя

1. ✅ Проверьте, что приложение работает
2. ✅ Протестируйте загрузку файлов
3. ✅ Проверьте дашборды
4. ✅ Убедитесь, что данные сохраняются в Supabase

## Важные замечания

- **Vercel автоматически устанавливает зависимости** при каждом деплое
- **Не коммитьте `.env.local`** в Git (он уже в `.gitignore`)
- **Все переменные окружения** должны быть добавлены в Vercel Dashboard
- **RLS policies** должны быть настроены в Supabase для production
