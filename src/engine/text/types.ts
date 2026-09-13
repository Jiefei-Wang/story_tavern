export interface TextDocument {
    text: string;
    revision: number;
    [key: string]: unknown;
}
export interface TextWorld {
    setupVersion?: 2;
    version: 1;
    revision: number;
    documents: Record<string, TextDocument>;
    characters: string[];
    playerId: string;
    scene: string;
    characterMode: 'three' | 'combined';
    [key: string]: unknown;
}
export interface Delivery {
    character_id: string;
    seen: string | null;
    heard: string | null;
    felt: string | null;
    environment: string;
    common: string;
}
export interface TextEvent {
    order: number;
    source: string;
    text: string;
    public: boolean;
}
export interface TextTurnData {
    pipeline?: 'routed-v2';
    designs?: CharacterDesign[];
    createdCharacters?: string[];
    /** Transaction before includes the old result; storyBefore is the replay base. */
    storyBefore?: TextWorld;
    effectiveInput?: string;
    correctionOf?: string;
    supersededBy?: string;
    before: TextWorld;
    after: TextWorld;
    events: TextEvent[];
    deliveries: Delivery[];
    characters: Record<string, {
        cognition: string;
        speech: string;
        action: string;
    }>;
    instructions: unknown;
    commit: 'draft' | 'saved';
}
export interface CharacterDesign {
    character_id: string;
    expression: string | null;
    action: string | null;
    end_state: Record<string, unknown>;
}
export interface CharacterRoute {
    characters: string[];
    new_characters: { request_id: string; description: string }[];
    instructions: string;
}
