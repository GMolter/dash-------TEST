import { useOrg } from './useOrg';

export function usePermission() {
  const { profile } = useOrg();

  const canManageOrg = () => {
    return profile?.role === 'owner' || profile?.role === 'admin';
  };

  const canPromoteMembers = () => {
    return profile?.role === 'owner' || profile?.role === 'admin';
  };

  const canDeleteOrg = () => {
    return profile?.role === 'owner';
  };

  const isOwner = () => {
    return profile?.role === 'owner';
  };

  const isAdmin = () => {
    return profile?.role === 'admin';
  };

  const isMember = () => {
    return profile?.role === 'member';
  };

  return {
    canManageOrg,
    canPromoteMembers,
    canDeleteOrg,
    isOwner,
    isAdmin,
    isMember,
    role: profile?.role || 'member',
  };
}
