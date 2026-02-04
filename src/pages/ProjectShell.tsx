import { ProjectDashboard } from './ProjectDashboard';

export function ProjectShell({
  projectId,
  onBack,
}: {
  projectId?: string;
  onBack: () => void;
}) {
  return <ProjectDashboard projectId={projectId} onBack={onBack} />;
}
