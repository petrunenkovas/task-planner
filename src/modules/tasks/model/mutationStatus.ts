export type MutationNotice = { kind: 'success' | 'error'; text: string } | null;
export type MutationStatus = { pending: number; notice: MutationNotice };
export type MutationEvent =
    | { type: 'start' }
    | { type: 'success'; text: string }
    | { type: 'error'; text: string }
    | { type: 'finish' }
    | { type: 'dismiss' }
    | { type: 'expire-success' };

export const INITIAL_MUTATION_STATUS: MutationStatus = { pending: 0, notice: null };

export function mutationStatusReducer(state: MutationStatus, event: MutationEvent): MutationStatus {
    switch (event.type) {
        case 'start':
            return { pending: state.pending + 1, notice: state.pending ? state.notice : null };
        case 'success':
            return state.notice?.kind === 'error'
                ? state
                : { ...state, notice: { kind: 'success', text: event.text } };
        case 'error':
            return { ...state, notice: { kind: 'error', text: event.text } };
        case 'finish':
            return { ...state, pending: Math.max(0, state.pending - 1) };
        case 'expire-success':
            return state.notice?.kind === 'success' && state.pending === 0
                ? { ...state, notice: null }
                : state;
        case 'dismiss':
            return { ...state, notice: null };
    }
}
