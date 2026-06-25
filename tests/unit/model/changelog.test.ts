import { describe, expect, it } from 'vitest';
import {
  changelogReducer,
  renumberCallouts,
  DRAWING_TOOLS,
  TOOL_KINDS,
  type Annotation,
  type CalloutAnnotation,
  type Changelog,
  type TextAnnotation,
} from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

describe('tool kind constants', () => {
  it('DRAWING_TOOLS is the five drawing tools and excludes select', () => {
    expect(DRAWING_TOOLS).toEqual(['callout', 'text', 'arrow', 'highlight', 'element']);
    expect(DRAWING_TOOLS).not.toContain('select');
  });

  it('TOOL_KINDS leads with select then the drawing tools', () => {
    expect(TOOL_KINDS).toEqual(['select', ...DRAWING_TOOLS]);
  });
});

const target: TargetRef = {
  selector: '#x',
  fallbacks: [],
  tag: 'div',
  rect: { x: 0, y: 0, width: 0, height: 0 },
};

function callout(id: string, createdAt = 0): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    createdAt,
    target,
    index: 0,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
  };
}

function text(id: string, createdAt = 0): TextAnnotation {
  return {
    id,
    kind: 'text',
    createdAt,
    target,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
  };
}

function changelog(annotations: Annotation[]): Changelog {
  return { id: 'c', url: 'https://x', title: 'X', capturedAt: 0, annotations };
}

function indices(state: Changelog): [string, number | undefined][] {
  return state.annotations.map((a) => [a.id, a.kind === 'callout' ? a.index : undefined]);
}

describe('renumberCallouts', () => {
  it('numbers callouts 1-based and contiguous, ignoring other kinds', () => {
    const result = renumberCallouts([callout('a'), text('t'), callout('b')]);
    expect(result.map((a) => (a.kind === 'callout' ? a.index : null))).toEqual([1, null, 2]);
  });

  it('does not mutate its input', () => {
    const input = [callout('a')];
    renumberCallouts(input);
    expect(input[0]?.index).toBe(0);
  });
});

describe('changelogReducer — add', () => {
  it('assigns sequential callout indices', () => {
    let state = changelog([]);
    state = changelogReducer(state, { type: 'add', annotation: callout('a') });
    state = changelogReducer(state, { type: 'add', annotation: text('t') });
    state = changelogReducer(state, { type: 'add', annotation: callout('b') });
    expect(indices(state)).toEqual([
      ['a', 1],
      ['t', undefined],
      ['b', 2],
    ]);
  });
});

describe('changelogReducer — remove', () => {
  it('renumbers callouts after a middle delete', () => {
    const state = changelogReducer(changelog([callout('a'), callout('b'), callout('c')]), {
      type: 'replaceAll',
      annotations: [callout('a'), callout('b'), callout('c')],
    });
    const next = changelogReducer(state, { type: 'remove', id: 'b' });
    expect(indices(next)).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('is a no-op for an unknown id', () => {
    const next = changelogReducer(changelog([callout('a')]), { type: 'remove', id: 'zzz' });
    expect(next.annotations).toHaveLength(1);
  });
});

describe('changelogReducer — updateNote', () => {
  it('updates the matching annotation only', () => {
    const state = changelog([callout('a'), callout('b')]);
    const next = changelogReducer(state, { type: 'updateNote', id: 'b', note: 'hello' });
    expect(next.annotations.find((a) => a.id === 'b')?.note).toBe('hello');
    expect(next.annotations.find((a) => a.id === 'a')?.note).toBeUndefined();
  });

  it('is a no-op for an unknown id', () => {
    const next = changelogReducer(changelog([callout('a')]), {
      type: 'updateNote',
      id: 'zzz',
      note: 'x',
    });
    expect(next.annotations[0]?.note).toBeUndefined();
  });
});

describe('changelogReducer — update', () => {
  it('replaces an annotation by id', () => {
    const state = changelog([callout('a'), callout('b')]);
    const moved: Annotation = { ...callout('a'), offset: { dx: 9, dy: 9 } };
    const next = changelogReducer(state, { type: 'update', annotation: moved });
    expect(next.annotations.find((a) => a.id === 'a')).toMatchObject({ offset: { dx: 9, dy: 9 } });
  });
});

describe('changelogReducer — reorder', () => {
  it('moves an annotation and renumbers by new order', () => {
    const state = changelog([callout('a'), text('t'), callout('b')]);
    const next = changelogReducer(state, { type: 'reorder', from: 2, to: 0 });
    expect(indices(next)).toEqual([
      ['b', 1],
      ['a', 2],
      ['t', undefined],
    ]);
  });

  it('returns the original state when the source index is out of range', () => {
    const state = changelog([callout('a')]);
    const next = changelogReducer(state, { type: 'reorder', from: 9, to: 0 });
    expect(next).toBe(state);
  });
});

describe('changelogReducer — replaceAll', () => {
  it('replaces the annotation set and renumbers', () => {
    const next = changelogReducer(changelog([callout('a')]), {
      type: 'replaceAll',
      annotations: [callout('x'), callout('y')],
    });
    expect(indices(next)).toEqual([
      ['x', 1],
      ['y', 2],
    ]);
  });
});

it('never mutates the previous state', () => {
  const state = changelog([callout('a')]);
  const before = state.annotations;
  changelogReducer(state, { type: 'add', annotation: callout('b') });
  expect(state.annotations).toBe(before);
  expect(state.annotations).toHaveLength(1);
});
