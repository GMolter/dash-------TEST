import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quicklinks } from './Quicklinks';

const TEST_USER_ID = 'user-1';

const personalFolder = {
  id: 'folder-1',
  name: 'Design Tools',
  icon: '🎨',
  order_index: 0,
  scope: 'personal',
  user_id: TEST_USER_ID,
};

const personalLinks = [
  {
    id: 'link-1',
    title: 'Olio Docs',
    url: 'https://docs.olio.one/start',
    icon: '📚',
    order_index: 1,
    scope: 'personal',
    user_id: TEST_USER_ID,
    folder_id: null,
  },
  {
    id: 'link-2',
    title: 'Figma',
    url: 'https://figma.com/files',
    icon: '🎨',
    order_index: 0,
    scope: 'personal',
    user_id: TEST_USER_ID,
    folder_id: personalFolder.id,
  },
  {
    id: 'link-3',
    title: 'Team Handbook',
    url: 'https://handbook.example.com',
    icon: '📘',
    order_index: 0,
    scope: 'shared',
    user_id: 'user-2',
    folder_id: null,
  },
] as const;

const { deleteEqMock, deleteMock, fromMock, insertMock, updateEqMock, updateMock } = vi.hoisted(() => ({
  deleteEqMock: vi.fn(),
  deleteMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateEqMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: TEST_USER_ID } }),
}));

vi.mock('../hooks/useOrg', () => ({
  useOrg: () => ({ organization: { id: 'org-1', name: 'Olio' } }),
}));

vi.mock('../hooks/usePermission', () => ({
  usePermission: () => ({ canManageOrg: () => false }),
}));

function tableQuery(table: string) {
  const data = table === 'quicklinks' ? personalLinks : [personalFolder];
  return {
    select: vi.fn(() => ({ order: vi.fn(async () => ({ data, error: null })) })),
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  insertMock.mockResolvedValue({ error: null });
  updateEqMock.mockResolvedValue({ error: null });
  deleteEqMock.mockResolvedValue({ error: null });
  updateMock.mockImplementation(() => ({ eq: updateEqMock }));
  deleteMock.mockImplementation(() => ({ eq: deleteEqMock }));
  fromMock.mockImplementation(tableQuery);
});

describe('Quick Links management redesign', () => {
  it('renders the compact personal management hierarchy, counts, rows, and guidance', async () => {
    render(<Quicklinks editMode />);

    expect(await screen.findByRole('heading', { name: 'Personal Quick Links' })).toBeInTheDocument();
    expect(screen.getByText('Your bookmark library')).toBeInTheDocument();
    expect(screen.getByText('Drag the handle to reorder items. Drop a link onto a folder to organize it.')).toBeInTheDocument();
    expect(screen.getByText('Changes save automatically')).toBeInTheDocument();
    expect(screen.getByText('Design Tools')).toBeInTheDocument();
    expect(screen.getByText('Olio Docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Design Tools' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Olio Docs' })).toBeVisible();
    expect(screen.getByText('2 links · 1 folder')).toBeInTheDocument();
  });

  it('opens the new-link editor, updates the live preview, and creates a link', async () => {
    const user = userEvent.setup();
    render(<Quicklinks editMode />);
    await screen.findByText('Olio Docs');

    await user.click(screen.getByRole('button', { name: 'New link' }));
    const dialog = screen.getByRole('dialog', { name: 'Add link' });
    const createButton = within(dialog).getByRole('button', { name: 'Create link' });
    expect(createButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Title'), 'Project board');
    await user.type(within(dialog).getByLabelText('URL'), 'https://boards.example.com/work');
    await user.clear(within(dialog).getByLabelText('Icon'));
    await user.type(within(dialog).getByLabelText('Icon'), '🚀');

    expect(within(dialog).getByText('Project board')).toBeInTheDocument();
    expect(within(dialog).getByText('boards.example.com')).toBeInTheDocument();
    expect(createButton).toBeEnabled();

    await user.click(createButton);
    await waitFor(() => expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Project board',
      url: 'https://boards.example.com/work',
      icon: '🚀',
      scope: 'personal',
      folder_id: null,
    })));
    expect(screen.queryByRole('dialog', { name: 'Add link' })).not.toBeInTheDocument();
    expect(screen.getByText('Olio Docs')).toBeVisible();
  });

  it('supports folder creation, expansion, link editing, and both confirmation dialogs', async () => {
    const user = userEvent.setup();
    render(<Quicklinks editMode />);
    await screen.findByText('Design Tools');

    await user.click(screen.getByRole('button', { name: 'New folder' }));
    const addFolderDialog = screen.getByRole('dialog', { name: 'Add folder' });
    const createFolderButton = within(addFolderDialog).getByRole('button', { name: 'Create folder' });
    expect(createFolderButton).toBeDisabled();
    await user.type(within(addFolderDialog).getByLabelText('Folder name'), 'Research');
    expect(within(addFolderDialog).getByText('Research')).toBeInTheDocument();
    expect(createFolderButton).toBeEnabled();
    await user.click(within(addFolderDialog).getByRole('button', { name: 'Choose an icon' }));
    expect(within(addFolderDialog).getByRole('button', { name: 'Use 📁 icon' })).toBeVisible();
    await user.click(createFolderButton);
    await waitFor(() => expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Research',
      icon: '📁',
      org_id: 'org-1',
      user_id: TEST_USER_ID,
    })));

    const folderTitle = screen.getByText('Design Tools');
    const folderToggle = folderTitle.closest('button');
    expect(folderToggle).not.toBeNull();
    await user.click(folderToggle!);
    expect(await screen.findByText('Figma')).toBeVisible();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.documentElement.style.overflow).not.toBe('hidden');

    await user.click(screen.getByRole('button', { name: 'Edit Figma' }));
    const editLinkDialog = screen.getByRole('dialog', { name: 'Edit link' });
    expect(within(editLinkDialog).getByLabelText('Title')).toHaveValue('Figma');
    expect(within(editLinkDialog).getByLabelText('URL')).toHaveValue('https://figma.com/files');
    expect(within(editLinkDialog).getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await user.clear(within(editLinkDialog).getByLabelText('Title'));
    await user.type(within(editLinkDialog).getByLabelText('Title'), 'Figma Board');
    await user.click(within(editLinkDialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Figma Board',
      url: 'https://figma.com/files',
      scope: 'personal',
      folder_id: personalFolder.id,
    })));
    expect(updateEqMock).toHaveBeenCalledWith('id', 'link-2');

    await user.click(screen.getByRole('button', { name: 'Delete Figma' }));
    const deleteLinkDialog = screen.getByRole('dialog', { name: 'Delete this quick link?' });
    expect(deleteLinkDialog).toHaveTextContent('This can’t be undone.');
    await user.click(within(deleteLinkDialog).getByRole('button', { name: 'Delete link' }));
    await waitFor(() => expect(deleteEqMock).toHaveBeenCalledWith('id', 'link-2'));

    await user.click(screen.getByRole('button', { name: 'Delete Design Tools' }));
    const deleteFolderDialog = screen.getByRole('dialog', { name: 'Delete “Design Tools”?' });
    expect(within(deleteFolderDialog).getByRole('button', { name: /Move links to root/ })).toBeVisible();
    expect(within(deleteFolderDialog).getByRole('button', { name: 'Delete folder and all links' })).toBeVisible();
    await user.click(within(deleteFolderDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Delete “Design Tools”?' })).not.toBeInTheDocument();
  });

  it('keeps the shared collection flat and respects edit permissions', async () => {
    render(<Quicklinks editMode collection="shared" />);

    expect(await screen.findByRole('heading', { name: 'Shared Quick Links' })).toBeInTheDocument();
    expect(screen.getByText('Organization library')).toBeInTheDocument();
    expect(screen.getByText('Team Handbook')).toBeInTheDocument();
    expect(screen.getByText('Everyone')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder Team Handbook' })).not.toBeInTheDocument();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('quicklinks'));
  });
});
