import { supabase } from '../lib/supabase';

export type FileNodeType = 'folder' | 'doc' | 'upload';

export type FileNode = {
  id: string;
  project_id: string;
  type: FileNodeType;
  name: string;
  parent_id: string | null;
  sort_index: number;
  content: string | null;
  meta: any | null;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

export async function listNodes(projectId: string): Promise<FileNode[]> {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as FileNode[]) || [];
}

export async function ensureDefaultTree(projectId: string) {
  const { data, error } = await supabase
    .from('project_files')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);

  if (error) throw error;
  if ((data as any[])?.length) return;

  const planning = await createFolder(projectId, 'Planning', null);
  const research = await createFolder(projectId, 'Research', null);
  await createFolder(projectId, 'Ideas', null);
  await createFolder(projectId, 'Meeting Notes', null);

  if (planning) {
    await createDoc(projectId, 'Directions/Instructions', planning.id);
    await createDoc(projectId, 'Rubric', planning.id);
    await createDoc(projectId, 'Constraints/Restrictions', planning.id);
    await createDoc(projectId, 'Additional Context', planning.id);
  }

  await createDoc(projectId, 'Quick Notes', null);
  if (research) await createDoc(projectId, 'Notes', research.id);
}

export async function createFolder(projectId: string, name: string, parentId: string | null) {
  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      type: 'folder',
      name,
      parent_id: parentId,
      sort_index: await nextSortIndex(projectId, parentId),
      content: null,
      meta: null,
      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as FileNode;
}

export async function createDoc(projectId: string, name: string, parentId: string | null) {
  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      type: 'doc',
      name,
      parent_id: parentId,
      sort_index: await nextSortIndex(projectId, parentId),
      content: '',
      meta: null,
      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return (data as FileNode) || null;
}

export async function updateNode(
  nodeId: string,
  patch: Partial<Pick<FileNode, 'name' | 'content' | 'parent_id' | 'sort_index' | 'meta'>>,
) {
  const { error } = await supabase
    .from('project_files')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', nodeId);

  if (error) throw error;
}

export async function deleteNode(nodeId: string) {
  const { data, error } = await supabase.from('project_files').select('id').eq('parent_id', nodeId);
  if (error) throw error;

  for (const child of (data as any[]) || []) {
    await deleteNode(child.id);
  }

  const { error: delErr } = await supabase.from('project_files').delete().eq('id', nodeId);
  if (delErr) throw delErr;
}

export async function moveNode(nodeId: string, newParentId: string | null) {
  const { data: n, error } = await supabase.from('project_files').select('*').eq('id', nodeId).single();
  if (error) throw error;

  const node = n as FileNode;
  const next = await nextSortIndex(node.project_id, newParentId);
  await updateNode(nodeId, { parent_id: newParentId, sort_index: next });
}

async function nextSortIndex(projectId: string, parentId: string | null) {
  // IMPORTANT:
  // - parentId is UUID -> use eq
  // - root items -> parent_id is null -> use is(null)
  let q = supabase
    .from('project_files')
    .select('sort_index')
    .eq('project_id', projectId)
    .order('sort_index', { ascending: false })
    .limit(1);

  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);

  const { data, error } = await q;
  if (error) throw error;

  const top = (data as any[])?.[0]?.sort_index;
  return (typeof top === 'number' ? top : 0) + 10;
}

export function getFileTypeInfo(node: FileNode): {
  category: 'pdf' | 'docx' | 'image' | 'text' | 'unknown';
  color: string;
  extension: string;
} {
  if (node.type !== 'upload') {
    return { category: 'text', color: 'text-slate-200', extension: '' };
  }

  const mime = node.meta?.mime || '';
  const name = node.name.toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return { category: 'pdf', color: 'text-red-400', extension: 'PDF' };
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  ) {
    return { category: 'docx', color: 'text-blue-400', extension: 'DOCX' };
  }

  if (
    mime.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.gif') ||
    name.endsWith('.svg')
  ) {
    return { category: 'image', color: 'text-emerald-400', extension: 'IMG' };
  }

  if (
    mime.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.rtf')
  ) {
    return { category: 'text', color: 'text-slate-300', extension: 'TXT' };
  }

  return { category: 'unknown', color: 'text-slate-400', extension: 'FILE' };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 10) / 10} ${sizes[i]}`;
}

export async function uploadAttachment(projectId: string, file: File, parentId: string | null) {
  const path = `${projectId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      type: 'upload',
      name: file.name,
      parent_id: parentId,
      sort_index: await nextSortIndex(projectId, parentId),
      content: null,
      meta: { url: publicUrl, path, size: file.size, mime: file.type },
      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as FileNode;
}
