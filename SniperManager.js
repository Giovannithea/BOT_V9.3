const { Connection, PublicKey } = require('@solana/web3.js');
const Sniper = require('./Sniper');
require('dotenv').config();

class SniperManager {
    static activeSnipers = new Map();
    static connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

    static async addSniper(lpData) {
        try {
            console.log('[SniperManager] Received lpData keys:', Object.keys(lpData));
            console.log('[SniperManager] Validating required fields...');

            // Enhanced validation with better error messages
            const requiredFields = ['ammId', 'baseMint', 'marketId', 'tokenId'];
            const missingFields = requiredFields.filter(field => !lpData?.[field]);

            if (missingFields.length > 0) {
                console.error('[SniperManager] Missing fields:', missingFields);
                console.error('[SniperManager] Available fields:', Object.keys(lpData || {}));
                throw new Error(`Invalid LP data - missing required fields: ${missingFields.join(', ')}`);
            }

            console.log('[SniperManager] All required fields present, creating config...');

            const config = {
                // Use lpData.tokenId instead of lpData._id
                tokenId: lpData.tokenId,  // FIXED: was lpData._id
                ammId: lpData.ammId,
                baseMint: lpData.baseMint,
                quoteMint: lpData.quoteMint,
                baseDecimals: lpData.baseDecimals || 9,
                quoteDecimals: lpData.quoteDecimals || 9,
                buyAmount: lpData.buyAmount || parseFloat(process.env.BUY_AMOUNT) || 0.02,
                poolState: {
                    id: lpData.ammId,
                    baseVault: lpData.baseVault,
                    quoteVault: lpData.quoteVault,
                    marketId: lpData.marketId,
                    marketProgramId: lpData.marketProgramId,
                    // Add V2 market data if available
                    marketBids: lpData.marketBids,
                    marketAsks: lpData.marketAsks,
                    marketEventQueue: lpData.marketEventQueue
                }
            };

            console.log('[SniperManager] Config created:', {
                tokenId: config.tokenId,
                ammId: config.ammId,
                baseMint: config.baseMint
            });

            if (this.activeSnipers.has(config.ammId)) {
                console.log(`[Sniper] Already tracking AMM: ${config.ammId}`);
                return;
            }

            console.log(`[Sniper] Initializing for AMM: ${config.ammId}`);
            const sniper = new Sniper(config);

            // Immediate buy execution
            await sniper.executeBuy();

            // Start price monitoring
            const monitorInterval = setInterval(async () => {
                try {
                    const currentPrice = await sniper.getCurrentPrice();
                    if (currentPrice >= config.sellTargetPrice) {
                        await sniper.executeSell();
                        clearInterval(monitorInterval);
                        this.activeSnipers.delete(config.ammId);
                    }
                } catch (error) {
                    console.error(`[Monitor] Error:`, error.message);
                }
            }, 3000);

            this.activeSnipers.set(config.ammId, {
                config,
                interval: monitorInterval
            });

            console.log(`[SniperManager] Successfully added sniper for ${config.baseMint}`);

        } catch (error) {
            console.error(`[SniperManager] Error:`, error.message);
            console.error(`[SniperManager] Error stack:`, error.stack);
        }
    }

    static stopAll() {
        this.activeSnipers.forEach(sniper => clearInterval(sniper.interval));
        this.activeSnipers.clear();
    }
}

module.exports = SniperManager;