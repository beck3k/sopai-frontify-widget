import { HttpClient, type AppBridgeBlock } from '@frontify/app-bridge';

import { env } from './env';

const API_BASE = env.apiBase;

type WidgetAccessResponse = { allowed: boolean };

export async function checkWidgetAccess(domain: string, email: string): Promise<boolean> {
    const url = `${API_BASE}/frontify/widget-access?domain=${encodeURIComponent(domain)}&email=${encodeURIComponent(email)}`;
    console.log('[SOPAI:api] checkWidgetAccess requesting:', url);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to check widget access: ${res.status}`);
    }
    const data = (await res.json()) as WidgetAccessResponse;
    console.log('[SOPAI:api] checkWidgetAccess response:', data);
    return data.allowed;
}

type AuthPayload = {
    domain: string;
    accountId: string;
    portalId: number;
    blockId: number;
    userId: string;
    email: string;
    timestamp: number;
    hmac: string;
};

export type AuthResponse = {
    access_token: string;
    user_id: string;
    first_name: string;
    last_name: string;
    bot_config: unknown;
    org_details: {
        config: {
            name: string;
            slug: string;
            logo: string;
            page_title: string;
            chat_title: string;
            bot_name: string;
            bot_greeting: string;
            bot_typing: string;
            bot_icon: string;
            favicon: string;
            primary_color: string;
            secondary_color: string;
            show_doc_source: boolean;
            has_today_items: boolean;
            query_type: string;
            show_links: boolean;
            allow_guest_access: boolean;
            id: string;
            reply_placeholder: string;
        };
    };
    roles: string[];
    initial_pass_changed: boolean;
    personal_info_consent: boolean;
    org_slug: string;
};

async function signPayload(payload: Omit<AuthPayload, 'hmac'>, key: string): Promise<string> {
    const message = `${payload.domain}:${payload.accountId}:${payload.portalId}:${payload.blockId}:${payload.userId}:${payload.email}:${payload.timestamp}`;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function authenticate(
    appBridge: AppBridgeBlock,
    user: { id: string; email: string },
    hmacKey: string,
): Promise<AuthResponse> {
    const domain = window.location.origin;
    console.log('[SOPAI:api] authenticate() starting for user:', user.email);

    // 1. Gather context from app bridge
    console.log('[SOPAI:api] Step 1: Gathering context (account, portal, block)...');
    const accountRes = await HttpClient.post('/graphql', {
        query: '{ account { id } }',
    } as Record<never, never>);
    const accountId = (accountRes as unknown as { result: { data: { account: { id: string } } } }).result.data.account
        .id;
    const portalId = appBridge.context('portalId').get();
    const blockId = appBridge.context('blockId').get();
    console.log('[SOPAI:api] Step 1 done, context:', { accountId, portalId, blockId });

    // 2. Build and sign the payload using the configured HMAC key
    console.log('[SOPAI:api] Step 2: Signing payload...');
    const timestamp = Math.floor(Date.now() / 1000);
    const payload: Omit<AuthPayload, 'hmac'> = {
        domain,
        accountId,
        portalId,
        blockId,
        userId: user.id,
        email: user.email,
        timestamp,
    };
    const hmac = await signPayload(payload, hmacKey);
    console.log('[SOPAI:api] Step 2 done, HMAC:', `${hmac.slice(0, 16)}...`);

    // 3. Send to our backend for JWT
    console.log('[SOPAI:api] Step 3: Posting to /frontify/auth...');
    const authRes = await fetch(`${API_BASE}/frontify/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, hmac }),
    });
    if (!authRes.ok) {
        const body = await authRes.text();
        console.error('[SOPAI:api] Step 3 FAILED:', authRes.status, body);
        throw new Error(`Auth failed: ${authRes.status} - ${body}`);
    }
    const session = (await authRes.json()) as AuthResponse;
    console.log('[SOPAI:api] Step 3 done, JWT received for:', session.first_name, session.last_name);
    return session;
}
