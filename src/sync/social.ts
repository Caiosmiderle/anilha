import { rpc } from './client';
import { invalidateRemote } from './remote';

export interface FriendActivity {
  kind: 'session' | 'run';
  id: string;
  local_date: string;
  title: string;
  reactions: number;
  reacted: boolean;
  distance_km?: number | null;
}

export interface FriendRecord {
  exercise_name: string;
  kind: string;
  local_date: string;
  value: number | null;
  unit: string;
}

export interface FriendOverview {
  id: string;
  name: string;
  share_details: boolean;
  adherence: {
    planned_gym: number;
    planned_run: number;
    done_gym: number;
    done_run: number;
  } | null;
  activities: FriendActivity[] | null;
  records: FriendRecord[] | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  join_code: string;
  is_owner: boolean;
  members: number;
}

export interface RankingRow {
  id: string;
  name: string;
  is_me: boolean;
  planned_gym: number;
  planned_run: number;
  done_gym: number;
  done_run: number;
  pct: number;
  position: number;
}

type Result<T> = T & { error?: string };

export const ERROR_TEXT: Record<string, string> = {
  invalido: 'Código inválido ou expirado',
  proprio: 'Esse convite é seu',
  tentativas: 'Muitas tentativas, espere uma hora',
  limite: 'Limite atingido por hoje',
  cheio: 'Grupo cheio',
  nao_amigo: 'Vocês não são amigos',
  privado: 'Treinos privados',
  nome: 'Nome inválido',
  nao_membro: 'Você não está nesse grupo',
  ja_membro: 'Já está no grupo',
};

function done(prefixes: string[]) {
  prefixes.forEach(invalidateRemote);
}

export async function createInvite(): Promise<Result<{ code: string; expires_at: string }>> {
  return rpc('create_invite');
}

export async function inviteInfo(
  code: string,
): Promise<Result<{ inviter_name: string; already_friends: boolean }>> {
  return rpc('invite_info', { p_code: code });
}

export async function acceptInvite(
  code: string,
): Promise<Result<{ friend_id: string; name: string }>> {
  const r = await rpc<Result<{ friend_id: string; name: string }>>('accept_invite', {
    p_code: code,
  });
  done(['friends_overview']);
  return r;
}

export async function removeFriend(id: string): Promise<void> {
  await rpc('remove_friend', { p_friend: id });
  done(['friends_overview', 'group_ranking']);
}

export async function blockUser(id: string): Promise<void> {
  await rpc('block_user', { p_target: id });
  done(['friends_overview', 'group_ranking', 'list_blocked']);
}

export async function unblockUser(id: string): Promise<void> {
  await rpc('unblock_user', { p_target: id });
  done(['list_blocked']);
}

export async function setReaction(
  owner: string,
  kind: 'session' | 'run',
  target: string,
  on: boolean,
) {
  const r = await rpc<Result<{ ok: boolean }>>('set_reaction', {
    p_owner: owner,
    p_kind: kind,
    p_target: target,
    p_on: on,
  });
  done(['friends_overview']);
  return r;
}

export async function createGroup(
  name: string,
): Promise<Result<{ id: string; join_code: string }>> {
  const r = await rpc<Result<{ id: string; join_code: string }>>('create_group', { p_name: name });
  done(['my_groups']);
  return r;
}

export async function joinGroup(code: string): Promise<Result<{ id: string; name: string }>> {
  const r = await rpc<Result<{ id: string; name: string }>>('join_group', { p_code: code });
  done(['my_groups']);
  return r;
}

export async function leaveGroup(id: string): Promise<void> {
  await rpc('leave_group', { p_group: id });
  done(['my_groups', 'group_ranking']);
}

export interface GroupCandidate {
  id: string;
  name: string;
  state: 'membro' | 'convidado' | 'livre';
}

export async function inviteToGroup(
  group: string,
  friend: string,
): Promise<Result<{ ok: boolean; name: string }>> {
  const r = await rpc<Result<{ ok: boolean; name: string }>>('invite_to_group', {
    p_group: group,
    p_friend: friend,
  });
  done(['group_invite_candidates']);
  return r;
}

export async function answerGroupInvite(
  invite: string,
  accept: boolean,
): Promise<Result<{ ok: boolean; group_id: string; name: string }>> {
  const r = await rpc<Result<{ ok: boolean; group_id: string; name: string }>>(
    'answer_group_invite',
    { p_invite: invite, p_accept: accept },
  );
  done(['inbox', 'my_groups', 'group_ranking']);
  return r;
}

export type InboxItem =
  | {
      kind: 'reaction';
      at: string;
      actor_id: string;
      actor_name: string;
      target_kind: 'session' | 'run';
      target_id: string;
    }
  | {
      kind: 'group_invite';
      at: string;
      id: string;
      status: 'pending' | 'accepted' | 'declined';
      actor_id: string;
      actor_name: string;
      group_id: string;
      group_name: string;
    }
  | {
      kind: 'group_joined';
      at: string;
      actor_id: string;
      actor_name: string;
      group_id: string;
      group_name: string;
    }
  | { kind: 'friend'; at: string; actor_id: string; actor_name: string }
  | { kind: 'ticket_answer'; at: string; id: string; ticket_kind: string }
  | {
      kind: 'routine';
      at: string;
      id: string;
      status: 'pending' | 'accepted' | 'declined';
      actor_id: string | null;
      actor_name: string;
      name: string;
      from_team: boolean;
    }
  | {
      kind: 'announcement';
      at: string;
      id: string;
      title: string;
      body: string;
      url: string | null;
    }
  | {
      kind: 'routine_accepted';
      at: string;
      id: string;
      actor_id: string;
      actor_name: string;
      name: string;
    }
  | { kind: 'agent_done'; at: string; id: string; pedido: string };

export function inviteLink(code: string): string {
  return `${window.location.origin}/convite/${code}`;
}

/** Native share sheet when there is one, clipboard otherwise. */
export async function shareText(
  title: string,
  text: string,
  url: string,
): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch {
    // Cancelled share falls through to copy.
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
