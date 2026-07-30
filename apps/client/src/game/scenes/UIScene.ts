import { GameObjects, Scene } from 'phaser';

const MAX_COMBAT_LOG_LINES = 4;
const MAX_CHAT_LOG_LINES = 8;
const HUD_BOTTOM_BAR_CLEARANCE = 104;

const HUD_COLORS = {
    panel: 'rgba(22, 16, 10, 0.84)',
    border: '#7c5c2b',
    text: '#f5e7c6',
    textSoft: '#d7c49c',
    combat: '#f7d66b',
    chat: '#d8e7ff',
    announcement: '#fff0bf'
} as const;

const HUD_FONT_TITLE = 'Georgia';
const HUD_FONT_BODY = 'Trebuchet MS, Arial, sans-serif';

/**
 * Dedicated HUD scene. Runs in parallel with Game and uses its own,
 * unzoomed camera, so on-screen text is never affected by the world
 * camera's zoom/scroll — a single shared camera would otherwise scale
 * and reposition scrollFactor(0) text along with the world.
 */
export class UIScene extends Scene {
    private combatLogText: GameObjects.Text | null = null;
    private chatLogText: GameObjects.Text | null = null;
    private announcementText: GameObjects.Text | null = null;

    private readonly combatLogLines: string[] = [];
    private readonly chatLogLines: string[] = [];

    constructor() {
        super('UIScene');
    }

    create(): void {
        this.createCombatLog();
        this.createChatLog();
        this.createAnnouncementBanner();

        this.scale.on('resize', () => {
            this.layoutHudAnchors();
        });
    }

    public logMessage(message: string): void {
        this.combatLogLines.push(message);

        if (this.combatLogLines.length > MAX_COMBAT_LOG_LINES) {
            this.combatLogLines.shift();
        }

        if (this.combatLogText === null) {
            return;
        }

        this.combatLogText.setText(this.combatLogLines.join('\n'));
    }

    public logChatMessage(message: string): void {
        this.chatLogLines.push(message);

        if (this.chatLogLines.length > MAX_CHAT_LOG_LINES) {
            this.chatLogLines.shift();
        }

        if (this.chatLogText === null) {
            return;
        }

        this.chatLogText.setText(this.chatLogLines.join('\n'));
    }

    public showAnnouncement(from: string, text: string): void {
        if (this.announcementText === null) {
            return;
        }

        this.announcementText.setText(`[${from}] ${text}`);
        this.announcementText.setAlpha(1);
        this.announcementText.setVisible(true);

        this.tweens.killTweensOf(this.announcementText);
        this.tweens.add({
            targets: this.announcementText,
            alpha: 0,
            duration: 5000,
            ease: 'Quad.Out',
            onComplete: () => {
                this.announcementText?.setVisible(false);
            }
        });
    }

    private createCombatLog(): void {
        this.combatLogText = this.add
            .text(16, this.scale.height - HUD_BOTTOM_BAR_CLEARANCE, '', {
                fontFamily: HUD_FONT_BODY,
                fontSize: '13px',
                color: HUD_COLORS.combat,
                backgroundColor: HUD_COLORS.panel,
                padding: {
                    x: 10,
                    y: 8
                },
                stroke: '#1a1207',
                strokeThickness: 3
            })
            .setOrigin(0, 1)
            .setDepth(1000);

        this.combatLogText.setText(this.combatLogLines.join('\n'));
    }

    private createChatLog(): void {
        this.chatLogText = this.add
            .text(
                this.scale.width - 16,
                this.scale.height - HUD_BOTTOM_BAR_CLEARANCE,
                '',
                {
                fontFamily: HUD_FONT_BODY,
                fontSize: '13px',
                color: HUD_COLORS.chat,
                backgroundColor: HUD_COLORS.panel,
                padding: {
                    x: 10,
                    y: 8
                },
                stroke: '#1a1207',
                strokeThickness: 3
                }
            )
            .setOrigin(1, 1)
            .setDepth(1000);

        this.chatLogText.setText(this.chatLogLines.join('\n'));
    }

    private createAnnouncementBanner(): void {
        this.announcementText = this.add
            .text(this.scale.width / 2, 48, '', {
                fontFamily: HUD_FONT_TITLE,
                fontSize: '32px',
                color: HUD_COLORS.announcement,
                stroke: '#1a1207',
                strokeThickness: 8,
                backgroundColor: 'rgba(42, 26, 15, 0.90)',
                padding: {
                    x: 18,
                    y: 12
                },
                align: 'center'
            })
            .setOrigin(0.5)
            .setDepth(1100)
            .setVisible(false)
            .setAlpha(0);
    }

    private layoutHudAnchors(): void {
        const bottomY = this.scale.height - HUD_BOTTOM_BAR_CLEARANCE;

        if (this.combatLogText) {
            this.combatLogText.setPosition(16, bottomY);
        }

        if (this.chatLogText) {
            this.chatLogText.setPosition(this.scale.width - 16, bottomY);
        }

        if (this.announcementText) {
            this.announcementText.setPosition(this.scale.width / 2, 48);
        }
    }
}
