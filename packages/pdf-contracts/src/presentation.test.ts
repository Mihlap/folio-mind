import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_SLIDE_ASPECT,
  PRESENTATION_SLIDE_HEIGHT_PT,
  PRESENTATION_SLIDE_WIDTH_PT,
  fitImageContain,
  isPresentationSlideLayout,
  moveSlide,
  normalizeSlidePositions,
  parsePresentationAiDraft,
  resolveSlideGeometry,
  splitSlideBullets,
  wrapSlideText,
  type PresentationSlideInput,
} from './presentation.js';

const measureFixed = (charWidth: number) => (line: string) => line.length * charWidth;

describe('presentation', () => {
  it('uses a 16:9 slide canvas', () => {
    expect(PRESENTATION_SLIDE_ASPECT).toBeCloseTo(16 / 9, 5);
    expect(PRESENTATION_SLIDE_WIDTH_PT / PRESENTATION_SLIDE_HEIGHT_PT).toBeCloseTo(16 / 9, 5);
  });

  it('keeps every layout rect inside the slide', () => {
    const layouts = ['title_only', 'image_right', 'image_top', 'image_full', 'section'] as const;
    for (const layout of layouts) {
      const geometry = resolveSlideGeometry(layout);
      const rects = [geometry.textRect, geometry.imageRect].filter(Boolean);
      for (const rect of rects) {
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.y).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(PRESENTATION_SLIDE_WIDTH_PT);
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(PRESENTATION_SLIDE_HEIGHT_PT);
      }
    }
  });

  it('leaves no room for images in text only layouts', () => {
    expect(resolveSlideGeometry('title_only').imageRect).toBeNull();
    expect(resolveSlideGeometry('section').imageRect).toBeNull();
  });

  it('validates layout names', () => {
    expect(isPresentationSlideLayout('image_right')).toBe(true);
    expect(isPresentationSlideLayout('nonsense')).toBe(false);
  });

  it('fits a portrait page inside a landscape box without overflow', () => {
    const box = { x: 0, y: 0, width: 400, height: 400 };
    const fitted = fitImageContain(box, 210, 297);
    expect(fitted.height).toBeCloseTo(400, 5);
    expect(fitted.width).toBeLessThanOrEqual(400);
    expect(fitted.x).toBeCloseTo((400 - fitted.width) / 2, 5);
  });

  it('keeps aspect ratio for a wide image', () => {
    const fitted = fitImageContain({ x: 0, y: 0, width: 800, height: 300 }, 1920, 1080);
    expect(fitted.width / fitted.height).toBeCloseTo(1920 / 1080, 5);
    expect(fitted.width).toBeLessThanOrEqual(800);
    expect(fitted.height).toBeLessThanOrEqual(300);
  });

  it('degrades gracefully for unknown image size', () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    expect(fitImageContain(box, 0, 0)).toEqual(box);
  });

  it('renumbers positions after sorting', () => {
    const slides: PresentationSlideInput[] = [
      { position: 2, layoutVariant: 'title_only' },
      { position: 0, layoutVariant: 'title_only' },
      { position: 1, layoutVariant: 'title_only' },
    ];
    expect(normalizeSlidePositions(slides).map((slide) => slide.position)).toEqual([0, 1, 2]);
  });

  it('moves a slide and renumbers', () => {
    const slides: PresentationSlideInput[] = [
      { id: 'a', position: 0, layoutVariant: 'title_only' },
      { id: 'b', position: 1, layoutVariant: 'title_only' },
      { id: 'c', position: 2, layoutVariant: 'title_only' },
    ];
    const moved = moveSlide(slides, 0, 2);
    expect(moved.map((slide) => slide.id)).toEqual(['b', 'c', 'a']);
    expect(moved.map((slide) => slide.position)).toEqual([0, 1, 2]);
  });

  it('ignores out of range moves', () => {
    const slides: PresentationSlideInput[] = [
      { id: 'a', position: 0, layoutVariant: 'title_only' },
      { id: 'b', position: 1, layoutVariant: 'title_only' },
    ];
    expect(moveSlide(slides, 5, 0)).toBe(slides);
    expect(moveSlide(slides, 0, 0)).toBe(slides);
  });

  it('clamps the target position', () => {
    const slides: PresentationSlideInput[] = [
      { id: 'a', position: 0, layoutVariant: 'title_only' },
      { id: 'b', position: 1, layoutVariant: 'title_only' },
    ];
    expect(moveSlide(slides, 0, 99).map((slide) => slide.id)).toEqual(['b', 'a']);
  });

  it('splits bullets and strips markers', () => {
    expect(splitSlideBullets('- первое\n• второе\nтретье\n\n')).toEqual([
      'первое',
      'второе',
      'третье',
    ]);
  });

  it('wraps text within the available width', () => {
    const lines = wrapSlideText('одно два три четыре пять', 100, measureFixed(10));
    expect(lines).toEqual(['одно два', 'три четыре', 'пять']);
    for (const line of lines) {
      expect(line.length * 10).toBeLessThanOrEqual(100);
    }
  });

  it('never returns more than maxLines and marks the cut', () => {
    const lines = wrapSlideText('а б в г д е ж', 20, measureFixed(10), 2);
    expect(lines).toHaveLength(2);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
  });

  it('keeps an oversized single word on its own line', () => {
    const lines = wrapSlideText('супердлинное', 20, measureFixed(10));
    expect(lines).toEqual(['супердлинное']);
  });

  it('returns no lines for blank text', () => {
    expect(wrapSlideText('   ', 100, measureFixed(10))).toEqual([]);
  });

  it('parses a JSON draft wrapped in prose', () => {
    const draft = parsePresentationAiDraft(
      'Вот черновик: {"title":"Проект","subtitle":"эскиз","slides":[{"sourcePage":3,"layoutVariant":"image_right","title":"План","body":"- пункт"}]} готово',
    );
    expect(draft?.title).toBe('Проект');
    expect(draft?.slides).toHaveLength(1);
    expect(draft?.slides[0].sourcePage).toBe(3);
    expect(draft?.slides[0].layoutVariant).toBe('image_right');
  });

  it('falls back to the default layout for unknown variants', () => {
    const draft = parsePresentationAiDraft('{"slides":[{"layoutVariant":"weird","title":"A"}]}');
    expect(draft?.slides[0].layoutVariant).toBe('image_top');
  });

  it('merges an array body into newline-separated theses', () => {
    const draft = parsePresentationAiDraft(
      '{"slides":[{"body":["тезис 1","  тезис 2  ","тезис 3"]}]}',
    );
    expect(draft?.slides[0].body).toBe('тезис 1\nтезис 2\nтезис 3');
  });

  it('recovers a draft where the model forgot a closing brace on a slide', () => {
    const draft = parsePresentationAiDraft(
      '{"title":"Квартал","subtitle":"эскиз","slides":[' +
        '{"sourcePage":3,"layoutVariant":"image_top","title":"Проектные решения","body":["тезис 1","тезис 2"]},' +
        '{"sourcePage":4,"layoutVariant":"image_top","title":"Благоустройство","body":["тезис 3"' +
        ']},{"sourcePage":5,"layoutVariant":"image_right","title":"Смета","body":["тезис 4"]}]}',
    );
    expect(draft?.title).toBe('Квартал');
    expect(draft?.slides.map((slide) => slide.title)).toEqual([
      'Проектные решения',
      'Благоустройство',
      'Смета',
    ]);
    expect(draft?.slides[0].body).toBe('тезис 1\nтезис 2');
    expect(draft?.slides[2].sourcePage).toBe(5);
  });

  it('recovers a draft with a trailing comma before the array closes', () => {
    const draft = parsePresentationAiDraft(
      '{"slides":[{"title":"Первый"},]}',
    );
    expect(draft?.slides).toHaveLength(1);
    expect(draft?.slides[0].title).toBe('Первый');
  });

  it('recovers a draft truncated mid-object by the token limit', () => {
    const draft = parsePresentationAiDraft(
      '{"title":"Обрезано","slides":[{"title":"Первый","body":["тезис 1"]},{"title":"Второй","body":["тезис',
    );
    expect(draft?.title).toBe('Обрезано');
    expect(draft?.slides).toHaveLength(2);
    expect(draft?.slides[0].title).toBe('Первый');
    expect(draft?.slides[1].title).toBe('Второй');
  });

  it('keeps unescaped newlines inside model strings instead of failing', () => {
    const draft = parsePresentationAiDraft(
      '{"slides":[{"title":"Первый","body":"строка 1\nстрока 2"}]}',
    );
    expect(draft?.slides[0].body).toBe('строка 1 строка 2');
  });

  it('rejects malformed drafts instead of throwing', () => {
    expect(parsePresentationAiDraft('не json вовсе')).toBeNull();
    expect(parsePresentationAiDraft('{"slides":')).toBeNull();
    expect(parsePresentationAiDraft('{"title":"нет слайдов"}')).toBeNull();
    expect(parsePresentationAiDraft('[1,2,3]')).toBeNull();
  });
});
