# Лицензии PDF-стека

Чеклист для фазы 0. Полный контекст — [PROJECT_PLAN.md](../PROJECT_PLAN.md) §3.3.

| Компонент | Пакет / инструмент | Лицензия (ориентир) | Где используется | Примечания |
|-----------|-------------------|---------------------|------------------|------------|
| Просмотр PDF | [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | Apache-2.0 | `packages/ui` (фаза 1), клиент | Основной viewer; не форкать движок |
| Обёртка viewer (опц.) | [react-pdf](https://github.com/wojtekmaj/react-pdf) | MIT | Клиент | Только **показ** PDF (wojtekmaj) |
| Лёгкие правки PDF | [pdf-lib](https://github.com/Hopding/pdf-lib) | MIT | Клиент | Merge/split страниц |
| Тяжёлые операции | [qpdf](https://github.com/qpdf/qpdf) | Apache-2.0 | `apps/worker` (контейнер) | Конвертация, repair |
| Растеризация / сжатие | [Ghostscript](https://www.ghostscript.com/) | AGPL / коммерческая (Artifex) | `apps/worker` (контейнер) | **Проверить лицензию** для SaaS/on-prem |
| Генерация отчётов PDF | [@react-pdf/renderer](https://github.com/diegomura/react-pdf) | MIT | Worker → S3 `exports/` | Только **создание** PDF (diegomura), не viewer |
| Резерв генерации | [PDFKit](https://github.com/foliojs/pdfkit) | MIT | Worker (по необходимости) | Если не хватит layout у renderer |

## Не путать две «react-pdf»

| Репозиторий | Назначение |
|-------------|------------|
| wojtekmaj/react-pdf | Показать существующий PDF |
| diegomura/react-pdf (`@react-pdf/renderer`) | Сгенерировать новый PDF из React |

## Шрифты и встраивание

- При генерации PDF (renderer) — только шрифты с разрешённой лицензией для встраивания (OFL / коммерческие).
- При flatten градиентов/прозрачности в worker — учитывать патентные ограничения Ghostscript в продакшене.

## Действия перед продакшеном

- [ ] Юридическая проверка Ghostscript (AGPL vs коммерческая лицензия Artifex).
- [ ] Зафиксировать версии qpdf/Ghostscript в Docker-образе worker.
- [ ] SBOM / `pnpm licenses` для npm-зависимостей viewer и pdf-lib.
