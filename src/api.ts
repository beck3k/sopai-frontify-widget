import { HttpClient, type AppBridgeBlock } from '@frontify/app-bridge';

import { env } from './env';

const API_BASE = env.apiBase;

type OrgInfoResponse = { asset_id: string; org_slug: string };

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

export async function getOrgInfo(domain: string): Promise<OrgInfoResponse> {
    console.log('[SOPAI:api] getOrgInfo requesting for domain:', domain);
    const res = await fetch(`${API_BASE}/frontify/hmac-asset?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch org info: ${res.status}`);
    }
    const data = (await res.json()) as OrgInfoResponse;
    console.log('[SOPAI:api] getOrgInfo response:', data);
    return data;
}

const HMAC_ASSET_QUERY = `{
    asset(id: "%ASSET_ID%") {
        customMetadata {
            ... on CustomMetadataValue {
                property { name }
                value
            }
        }
    }
}`;

type MetadataEntry = { property: { name: string }; value: string };

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

async function getHmacKey(assetId: string): Promise<string> {
    const query = HMAC_ASSET_QUERY.replace('%ASSET_ID%', assetId);
    const res = await HttpClient.post('/graphql', { query } as Record<never, never>);

    const data = res as unknown as { result: { data: { asset: { customMetadata: MetadataEntry[] } } } };
    const metadata = data.result.data.asset.customMetadata;
    const entry = metadata.find((m) => m.property.name === '_teammate_key');

    if (!entry) {
        throw new Error('HMAC key not found in asset metadata');
    }
    return entry.value;
}

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
): Promise<AuthResponse> {
    const domain = window.location.origin;
    console.log('[SOPAI:api] authenticate() starting for user:', user.email);

    // 1. Get the HMAC asset ID from our backend
    console.log('[SOPAI:api] Step 1: Fetching HMAC asset ID...');
    const { asset_id: assetId } = await getOrgInfo(domain);
    console.log('[SOPAI:api] Step 1 done, asset ID:', assetId);

    // 2. Fetch the HMAC key from Frontify (requires authenticated session)
    console.log('[SOPAI:api] Step 2: Fetching HMAC key from Frontify...');
    const hmacKey = await getHmacKey(assetId);
    console.log('[SOPAI:api] Step 2 done, got HMAC key');

    // 3. Gather context from app bridge
    console.log('[SOPAI:api] Step 3: Gathering context (account, portal, block)...');
    const accountRes = await HttpClient.post('/graphql', {
        query: '{ account { id } }',
    } as Record<never, never>);
    const accountId = (accountRes as unknown as { result: { data: { account: { id: string } } } }).result.data.account
        .id;
    const portalId = appBridge.context('portalId').get();
    const blockId = appBridge.context('blockId').get();
    console.log('[SOPAI:api] Step 3 done, context:', { accountId, portalId, blockId });

    // 4. Build and sign the payload
    console.log('[SOPAI:api] Step 4: Signing payload...');
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
    console.log('[SOPAI:api] Step 4 done, HMAC:', `${hmac.slice(0, 16)}...`);

    // 5. Send to our backend for JWT
    console.log('[SOPAI:api] Step 5: Posting to /frontify/auth...');
    const authRes = await fetch(`${API_BASE}/frontify/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, hmac }),
    });
    if (!authRes.ok) {
        const body = await authRes.text();
        console.error('[SOPAI:api] Step 5 FAILED:', authRes.status, body);
        throw new Error(`Auth failed: ${authRes.status} - ${body}`);
    }
    const session = (await authRes.json()) as AuthResponse;
    console.log('[SOPAI:api] Step 5 done, JWT received for:', session.first_name, session.last_name);
    return session;
}
