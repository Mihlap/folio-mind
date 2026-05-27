# Лицензии PDF-стека — Folio Mind

Чеклист перед коммерческим запуском. Стратегия: **не пишем свой PDF-движок** — см. [PROJECT_PLAN.md](../PROJECT_PLAN.md) §3.3.

## Зафиксированный стек

| Задача | Инструмент | Где | Лицензия (типичная) |
|--------|------------|-----|---------------------|
| Просмотр PDF | **PDF.js** (`pdfjs-dist`) | Клиент | Apache-2.0 |
| Обёртка viewer (опц.) | [wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf) | Клиент | MIT |
| Лёгкие операции (merge/split) | **pdf-lib** | Клиент | MIT |
| Превью, repair, конвертация | **qpdf** | Worker | Apache-2.0 |
| Растеризация/сжатие | **Ghostscript** | Worker | AGPL / коммерческая (⚠️ проверить) |
| Генерация отчётов PDF | **@react-pdf/renderer** | Worker | MIT |
| Резерв генерации | **PDFKit** | Worker | MIT |

## Две разные «react-pdf» (не путать)

| Пакет | Назначение |
|-------|------------|
| `react-pdf` (wojtekmaj) | **Показать** PDF (обёртка PDF.js) |
| `@react-pdf/renderer` (diegomura) | **Создать** новый PDF (отчёты), не редактировать чужой договор |

## Что не используем на v1

| Решение | Причина |
|---------|---------|
| Собственный парсер/рендер PDF | Не ценность продукта |
| Несколько viewer-движков одновременно | Разный рендер, тяжёлый бандл |
| EmbedPDF / PDFium | Только после замеров |
| Syncfusion PDF Viewer | Лицензия и вес |
| wonday/react-native-pdf | Для RN; у нас Capacitor + WebView |

## Действия до коммерции

- [ ] Юридическая проверка **Ghostscript** (AGPL vs коммерческая лицензия для SaaS).
- [ ] Патентная/лицензионная оценка PDF.js (Mozilla).
- [ ] Политика **встраиваемых шрифтов** в генерируемых PDF (subset, лицензии OFL/коммерческих).
- [ ] Документирование в DPA: обработка PDF на worker (временные файлы в S3).
- [ ] NOTICE/Third-party licenses в дистрибутиве (APK, если применимо).

## Хранение артефактов

Бинарные PDF — только **S3**, не Postgres. Временные файлы worker — префикс `folioFiles/processing/` с lifecycle TTL.

---

*Черновик. Обновлять при смене зависимостей в `package.json` / Docker-образах worker.*
