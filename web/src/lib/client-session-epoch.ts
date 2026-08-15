export type ClientSessionStamp = {
    userId: string;
    epoch: number;
};

export function createClientSessionEpoch(getUserId: () => string) {
    let epoch = 0;

    return {
        capture: (): ClientSessionStamp => ({ userId: getUserId(), epoch }),
        invalidate: () => {
            epoch += 1;
        },
        isCurrent: (stamp: ClientSessionStamp) => Boolean(stamp.userId) && stamp.epoch === epoch && getUserId() === stamp.userId,
        key: (stamp: ClientSessionStamp, id: string) => `${stamp.epoch}:${stamp.userId}:${id}`,
    };
}
