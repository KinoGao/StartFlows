export type LoginSecurityNotice = {
    networkChanged: boolean;
    deviceChanged: boolean;
    previousLoginAt: string;
};

export type UserLoginEvent = {
    id: string;
    ip?: string;
    userAgent?: string;
    createdAt: string;
};
