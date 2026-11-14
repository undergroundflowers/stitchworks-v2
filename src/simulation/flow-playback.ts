/**
 * Flow-playback -- turn the engine's entity-flow event stream
 * (`PmlSimResult.flow`) into per-bundle positions at any playback time.
 *
 * Phase 3 (sim-view fidelity). The DES emits instantaneous transfers, so a
 * bundle doesn't "travel" over sim time -- it SITS at a station (waiting in the
 * buffer, in service, or blocked-after-service) for real durations and hops
 * between stations at discrete instants. Rendering those station-anchored
 * states is the real fidelity win over the old `simTime x const` motion:
 * queues visibly build at bottlenecks and stations turn BLOCKED when their
 * finished piece can't advance. The view lerps a sprite between frames when a
 * bundle's station changes, so movement falls out of the render layer.
 *
 * This module is pure data -- no React, no coordinate system. It reports each
 * bundle's LOGICAL position (which station, what state, its rank in the queue)
 * and lets the caller project station ids to screen space with its own layout.
 */

import type { FlowEvent } from './pml-engine';

/** What a bundle is doing at a station right now. */
export type BundleState = 'waiting' | 'service' | 'blocked';

/** One bundle's logical position at a playback time. */
export interface BundleFrame {
  agentId: number;
  pieces: number;
  /** Station the bundle currently sits at (Workstation.id). */
  wsId: string;
  state: BundleState;
  /** The station this bundle arrived FROM (its previous stay), if any -- lets
   *  the caller glide a sprite in from the upstream station. */
  fromWsId?: string;
  /** 0-based rank among bundles sharing this station in the same state,
   *  oldest first. Drives visual stacking in the buffer. */
  rank: number;
}

/** One contiguous stay of an agent at a single station. */
interface Stay {
  agentId: number;
  pieces: number;
  wsId: string;
  fromWsId?: string;
  /** Arrival time at this station (sim minutes). */
  arriveT: number;
  /** Departure time -- the next move, the sink, or +Infinity if still there. */
  departT: number;
  /** Service start / end within the stay (Service blocks only; else null). */
  startServiceT: number | null;
  endServiceT: number | null;
  /** Blocking window within the stay (blocking-after-service; else null). */
  blockT: number | null;
}

export interface FlowPlayback {
  /** Bundles present in the system at playback time `t`, ranked per station. */
  bundlesAt(t: number): BundleFrame[];
  /** Workstation ids with >=1 blocked bundle at `t` (finished-but-can't-advance). */
  blockedAt(t: number): Set<string>;
  /** True when there is no recorded flow (recording was off or empty). */
  readonly empty: boolean;
  /** Total stays indexed -- diagnostic. */
  readonly stayCount: number;
}

/** Resolve the sub-state of a stay at time `t` (assumes arriveT <= t < departT). */
function stateAt(s: Stay, t: number): BundleState {
  // Blocked: service is done and the stay is holding the piece past endService.
  if (s.blockT != null && s.endServiceT != null && t >= s.endServiceT) return 'blocked';
  // In service.
  if (s.startServiceT != null && t >= s.startServiceT) {
    if (s.endServiceT == null || t < s.endServiceT) return 'service';
    // Post-service, no block recorded -> about to move (instantaneous); treat
    // as still in service so it doesn't flip to 'waiting' for a zero window.
    return 'service';
  }
  // Not yet in service (or a non-Service block like a Queue) -> waiting.
  return 'waiting';
}

/**
 * Build the playback index from a flow stream. O(events) preprocessing; each
 * `bundlesAt` is O(active-stays) via an arrival-sorted scan with early-out.
 */
export function buildFlowPlayback(flow: readonly FlowEvent[]): FlowPlayback {
  // Group events by agent, preserving stream order (already time-sorted).
  const byAgent = new Map<number, FlowEvent[]>();
  for (const e of flow) {
    const list = byAgent.get(e.agentId);
    if (list) list.push(e);
    else byAgent.set(e.agentId, [e]);
  }

  const stays: Stay[] = [];
  for (const [agentId, events] of byAgent) {
    let cur: Stay | null = null;
    for (const e of events) {
      switch (e.kind) {
        case 'move': {
          // Arrival at e.wsId -- close the previous stay, open a new one.
          if (cur) {
            cur.departT = e.t;
            stays.push(cur);
          }
          cur = {
            agentId,
            pieces: e.pieces,
            wsId: e.wsId,
            fromWsId: e.fromWsId,
            arriveT: e.t,
            departT: Number.POSITIVE_INFINITY,
            startServiceT: null,
            endServiceT: null,
            blockT: null,
          };
          break;
        }
        case 'startService':
          if (cur && cur.wsId === e.wsId) cur.startServiceT = e.t;
          break;
        case 'endService':
          if (cur && cur.wsId === e.wsId) cur.endServiceT = e.t;
          break;
        case 'block':
          if (cur && cur.wsId === e.wsId) cur.blockT = e.t;
          break;
        case 'merge':
        // Absorbed into another agent at a Combine / Assembler. Terminal for
        // this id exactly as a Sink is; the joined garment has its own stay.
        // falls through
        case 'sink':
          // Terminal: the agent is consumed at the Sink. The move(->Sink) just
          // opened a zero-duration stay at the Sink -- close it here so the
          // bundle vanishes at sink time rather than lingering on the Sink.
          if (cur) {
            cur.departT = e.t;
            stays.push(cur);
            cur = null;
          }
          break;
        // 'spawn' and 'unblock' need no stay bookkeeping: spawn is followed by
        // the first move (which opens the stay); unblock is followed by a move
        // (which closes this stay). The block window is already recorded.
        case 'spawn':
        case 'unblock':
          break;
      }
    }
    // Agent still in the system at end-of-run -- keep its open stay (departT infinity).
    if (cur) stays.push(cur);
  }

  // Sort by arrival so bundlesAt can scan in queue order and early-out.
  stays.sort((a, b) => a.arriveT - b.arriveT || a.agentId - b.agentId);
  const empty = stays.length === 0;

  function activeStays(t: number): Stay[] {
    const out: Stay[] = [];
    for (const s of stays) {
      if (s.arriveT > t) break; // sorted by arriveT -> nothing later can be active
      if (t < s.departT) out.push(s);
    }
    return out;
  }

  return {
    empty,
    stayCount: stays.length,
    bundlesAt(t: number): BundleFrame[] {
      const active = activeStays(t);
      // Rank within (station, state), oldest arrival first -- for stacking.
      // Nested wsId -> state -> count so arbitrary station ids can't collide.
      const rankByWs = new Map<string, Map<BundleState, number>>();
      const frames: BundleFrame[] = [];
      for (const s of active) {
        const state = stateAt(s, t);
        let byState = rankByWs.get(s.wsId);
        if (!byState) {
          byState = new Map<BundleState, number>();
          rankByWs.set(s.wsId, byState);
        }
        const rank = byState.get(state) ?? 0;
        byState.set(state, rank + 1);
        frames.push({
          agentId: s.agentId,
          pieces: s.pieces,
          wsId: s.wsId,
          state,
          fromWsId: s.fromWsId,
          rank,
        });
      }
      return frames;
    },
    blockedAt(t: number): Set<string> {
      const blocked = new Set<string>();
      for (const s of activeStays(t)) {
        if (stateAt(s, t) === 'blocked') blocked.add(s.wsId);
      }
      return blocked;
    },
  };
}
