import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Activity, Place } from '../types';
import { ActivityEditorModal } from './ActivityEditorModal';

const place: Place = {
  id: 'place-1',
  name: 'Taipei 101',
  region: 'Taipei',
  category: 'Landmark',
  latitude: 25.033,
  longitude: 121.5654,
  notes: '',
};

const activity: Activity = {
  id: 'activity-1',
  title: 'Visit the observatory',
  placeId: place.id,
  sortOrder: 0,
  category: 'Food',
  lock: { lockDay: false, lockTime: false },
};

afterEach(() => {
  cleanup();
});

function renderEditor(props: Partial<ComponentProps<typeof ActivityEditorModal>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const onEditPlace = vi.fn();

  render(
    <MantineProvider env="test">
      <ActivityEditorModal
        opened
        activity={activity}
        place={place}
        onClose={onClose}
        onSubmit={onSubmit}
        onEditPlace={onEditPlace}
        {...props}
      />
    </MantineProvider>,
  );

  return { onClose, onSubmit, onEditPlace };
}

describe('ActivityEditorModal', () => {
  it('separates linked place details from planning fields', () => {
    renderEditor();

    expect(screen.getByText('Edit plan & schedule')).not.toBeNull();
    expect(screen.getByText('Place category: Landmark')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit place details' })).not.toBeNull();
  });

  it('opens the linked place editor', () => {
    const { onClose, onEditPlace } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Edit place details' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onEditPlace).toHaveBeenCalledWith(place);
  });

  it('inherits the linked place category when saving', () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      activity.id,
      expect.objectContaining({ category: place.category }),
    );
  });

  it('keeps category editable for an activity without a linked place', () => {
    renderEditor({ place: undefined, activity: { ...activity, placeId: undefined } });

    expect(screen.getByRole('combobox', { name: 'Category' })).not.toBeNull();
  });
});
