import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLocationPicker } from './MapLocationPicker';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe('MapLocationPicker place search', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches only when submitted and selects an OpenStreetMap result', async () => {
    const onChange = vi.fn();
    const onPlaceSelected = vi.fn();
    const outerSubmit = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        place_id: 101,
        display_name: 'Sample Hall, Bloomington, Indiana',
        lat: '39.168500',
        lon: '-86.522000',
        type: 'university',
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<form onSubmit={(event) => { event.preventDefault(); outerSubmit(); }}><MapLocationPicker label="Place the classroom pin" value={null} onChange={onChange} onPlaceSelected={onPlaceSelected} /></form>);
    fireEvent.change(screen.getByPlaceholderText('Search a building, dorm, or address'), { target: { value: 'Sample Hall' } });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const result = await screen.findByRole('button', { name: /Sample Hall/ });
    expect(outerSubmit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=Sample+Hall');

    fireEvent.click(result);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ lat: 39.1685, lng: -86.522 }));
    expect(onPlaceSelected).toHaveBeenCalledWith('Sample Hall, Bloomington, Indiana');
  });
});
