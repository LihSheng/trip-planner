import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Group, Modal, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconCheck, IconCopy, IconInfoCircle, IconMail, IconTrash, IconUsers } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { getOrCreateShareToken, inviteTripCollaborator, loadTripCollaborators, removeTripCollaborator, type TripCollaborator } from '../lib/tripRepository';
import { useTrip } from '../context/TripContext';

interface ShareTripModalProps { opened: boolean; onClose: () => void; }

export function ShareTripModal({ opened, onClose }: ShareTripModalProps) {
  const { planId, persistForCloudSignIn: onPrepareCloudSignIn } = useTrip();
  const { accessToken, user, isDemo, requestMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<TripCollaborator[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<{ sent: boolean; message: string } | null>(null);

  async function refresh() {
    if (isDemo || !planId) return;
    setLoading(true); setError(null);
    try { setMembers(await loadTripCollaborators(accessToken, planId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load collaborators.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!opened || isDemo || !planId) return;
    void refresh();
    setLoading(true);
    getOrCreateShareToken(accessToken, planId)
      .then((token) => setShareUrl(`${window.location.origin}${window.location.pathname}?share=${token}`))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not create a share link.'))
      .finally(() => setLoading(false));
  }, [opened, isDemo, accessToken, planId]);

  async function copyShareUrl() {
    try { await navigator.clipboard.writeText(shareUrl); }
    catch { setError('Your browser could not copy the share link.'); }
  }

  async function invite() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) { setError('Enter a valid email address.'); return; }
    if (!planId) { setError('No trip plan is selected.'); return; }
    setLoading(true); setError(null); setInviteNotice(null);
    try {
      const result = await inviteTripCollaborator(accessToken, planId, normalized);
      setInviteNotice({ sent: result.emailSent, message: result.message });
      setEmail('');
      await refresh();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add collaborator.'); }
    finally { setLoading(false); }
  }
  async function remove(emailToRemove: string) {
    if (!planId) { setError('No trip plan is selected.'); return; }
    setLoading(true); setError(null);
    try { await removeTripCollaborator(accessToken, planId, emailToRemove); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove collaborator.'); }
    finally { setLoading(false); }
  }
  async function signInAndSave() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) { setError('Enter a valid email address.'); return; }
    setLoading(true); setError(null);
    try { onPrepareCloudSignIn(); await requestMagicLink(normalized); setEmail(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send the sign-in link.'); }
    finally { setLoading(false); }
  }

  return <Modal opened={opened} onClose={onClose} title={<Group gap="sm"><ThemeIcon variant="light" color="teal"><IconUsers size={18} /></ThemeIcon><Text fw={750}>Share trip</Text></Group>} centered>
    <Stack gap="md">
      {isDemo ? <>
        <Text size="sm" c="dimmed">Sign in to save this plan to Supabase, then invite collaborators.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput label="Your email" placeholder="you@example.com" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} leftSection={<IconMail size={16} />} autoComplete="email" />
        <Button leftSection={<IconMail size={16} />} onClick={() => void signInAndSave()} loading={loading}>Email me a sign-in link</Button>
        <Alert color="teal" variant="light" icon={<IconInfoCircle size={17} />}>Your current demo plan will be saved and moved to your cloud account after you open the email link.</Alert>
      </> : <>
        <Text size="sm" c="dimmed">Anyone with this link can view the full trip. They cannot edit it and do not need to sign in.</Text>
        <Group align="end" wrap="nowrap"><TextInput label="Read-only share link" value={shareUrl} readOnly style={{ flex: 1 }} /><Button leftSection={<IconCopy size={16} />} onClick={() => void copyShareUrl()} disabled={!shareUrl} loading={loading}>Copy link</Button></Group>
        <Divider />
        <Text size="sm" c="dimmed">Invite people by email. They sign in with a magic link using that exact email, then can edit this trip.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        {inviteNotice ? <Alert color={inviteNotice.sent ? 'teal' : 'orange'}>{inviteNotice.message}</Alert> : null}
        <Group align="end" wrap="nowrap"><TextInput label="Collaborator email" placeholder="friend@example.com" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} leftSection={<IconMail size={16} />} style={{ flex: 1 }} /><Button onClick={() => void invite()} loading={loading}>Invite</Button></Group>
        <Alert color="teal" variant="light" icon={<IconMail size={17} />}>Share the app link too. They do not need your password or account.</Alert>
        <Divider label="People with access" labelPosition="left" />
        <Stack gap="xs"><Group justify="space-between"><div><Text size="sm" fw={650}>{user.email ?? 'You'}</Text><Text size="xs" c="dimmed">Owner</Text></div><ThemeIcon size="sm" color="teal" variant="light"><IconCheck size={12} /></ThemeIcon></Group>
          {members.map((member) => <Group justify="space-between" key={member.inviteEmail}><div><Text size="sm" fw={600}>{member.inviteEmail}</Text><Text size="xs" c="dimmed">{member.accepted ? 'Can edit' : 'Invited — waiting for sign-in'}</Text></div><Button variant="subtle" color="red" size="compact-sm" leftSection={<IconTrash size={14} />} onClick={() => void remove(member.inviteEmail)} loading={loading}>Remove</Button></Group>)}
          {!loading && members.length === 0 ? <Text size="sm" c="dimmed">No collaborators yet.</Text> : null}
        </Stack>
      </>}
    </Stack>
  </Modal>;
}
