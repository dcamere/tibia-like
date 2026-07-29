import { GameObjects, Scene } from 'phaser';

const MAX_COMBAT_LOG_LINES = 4;
const MAX_CHAT_LOG_LINES = 8;

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
        this.createInstructions();
        this.createCombatLog();
        this.createChatLog();
        this.createAnnouncementBanner();
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
            duration: 2600,
            ease: 'Quad.Out',
            onComplete: () => {
                this.announcementText?.setVisible(false);
            }
        });
    }

    private createInstructions(): void {
        this.add
            .text(
                16,
                16,
                'WASD o flechas para moverte\nClic en una criatura para seleccionarla\nEspacio para atacar (rango 1 casilla)\nEnter para abrir chat\nEsc o clic vacío para cancelar el objetivo',
                {
                    fontFamily: 'Arial',
                    fontSize: '16px',
                    color: '#ffffff',
                    backgroundColor: '#000000aa',
                    padding: {
                        x: 10,
                        y: 6
                    }
                }
            )
            .setDepth(1000);
    }

    private createCombatLog(): void {
        this.combatLogText = this.add
            .text(16, this.scale.height - 16, '', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#ffe066',
                backgroundColor: '#000000aa',
                padding: {
                    x: 8,
                    y: 6
                }
            })
            .setOrigin(0, 1)
            .setDepth(1000);

        this.combatLogText.setText(this.combatLogLines.join('\n'));
    }

    private createChatLog(): void {
        this.chatLogText = this.add
            .text(this.scale.width - 16, this.scale.height - 16, '', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#dbeafe',
                backgroundColor: '#000000aa',
                padding: {
                    x: 8,
                    y: 6
                }
            })
            .setOrigin(1, 1)
            .setDepth(1000);

        this.chatLogText.setText(this.chatLogLines.join('\n'));
    }

    private createAnnouncementBanner(): void {
        this.announcementText = this.add
            .text(this.scale.width / 2, 48, '', {
                fontFamily: 'Georgia',
                fontSize: '32px',
                color: '#fff1b8',
                stroke: '#1a1207',
                strokeThickness: 8,
                backgroundColor: '#2a1a0fcc',
                padding: {
                    x: 16,
                    y: 10
                },
                align: 'center'
            })
            .setOrigin(0.5)
            .setDepth(1100)
            .setVisible(false)
            .setAlpha(0);
    }
}
