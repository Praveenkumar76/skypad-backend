const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Badge definitions
const BADGE_DEFINITIONS = {
  'first-solve': {
    name: 'First Solve',
    description: 'Solve your first problem',
    rarity: 'common',
    category: 'milestone',
    condition: (user) => user.solvedProblems.length >= 1
  },
  'algorithm-expert': {
    name: 'Algorithm Expert',
    description: 'Solved 10 algorithm challenges',
    rarity: 'rare',
    category: 'skill',
    condition: (user) => user.solvedProblems.filter(p => p.topic === 'Dynamic Programming' || p.topic === 'Greedy').length >= 10
  },
  'frontend-wizard': {
    name: 'Frontend Wizard',
    description: 'Completed 5 frontend problems',
    rarity: 'rare',
    category: 'skill',
    condition: (user) => user.solvedProblems.filter(p => p.topic === 'Array' || p.topic === 'String').length >= 5
  },
  'backend-architect': {
    name: 'Backend Architect',
    description: 'Participated in 3 collaborative sessions',
    rarity: 'epic',
    category: 'social',
    condition: (user) => user.contestHistory.length >= 3
  },
  'array-master': {
    name: 'Array Master',
    description: 'Complete all array problems',
    rarity: 'rare',
    category: 'skill',
    condition: (user) => user.solvedProblems.filter(p => p.topic === 'Array').length >= 10
  },
  'recursion-king': {
    name: 'Recursion King',
    description: 'Master recursive algorithms',
    rarity: 'epic',
    category: 'skill',
    condition: (user) => user.solvedProblems.filter(p => p.topic === 'Recursion').length >= 8
  },
  'speed-demon': {
    name: 'Speed Demon',
    description: 'Solve 10 problems in one day',
    rarity: 'legendary',
    category: 'milestone',
    condition: (user) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return user.solvedProblems.filter(p => p.solvedAt >= today && p.solvedAt < tomorrow).length >= 10;
    }
  },
  'perfectionist': {
    name: 'Perfectionist',
    description: 'Solve 50 problems without any wrong submissions',
    rarity: 'mythic',
    category: 'milestone',
    condition: (user) => user.solvedProblems.length >= 50 && user.stats.accuracy >= 100
  }
};

// Shop items definitions
const SHOP_ITEMS = {
  'double-xp-1h': {
    name: 'Double XP for 1 Hour',
    description: 'Gain 2x XP for the next hour',
    price: 500,
    type: 'booster',
    category: 'boosters',
    duration: 60 * 60 * 1000, // 1 hour in milliseconds
    multiplier: 2,
    boostType: 'xp'
  },
  'coin-boost-3challenges': {
    name: '10% Extra Coins for Next 3 Challenges',
    description: 'Earn 10% more coins for your next 3 problem solves',
    price: 400,
    type: 'booster',
    category: 'boosters',
    uses: 3,
    multiplier: 1.1,
    boostType: 'coins'
  },
  'dracula-theme': {
    name: 'Dracula Theme',
    description: 'Dark theme with purple accents',
    price: 300,
    type: 'theme',
    category: 'cosmetics',
    themeId: 'dracula'
  },
  'solarized-theme': {
    name: 'Solarized Theme',
    description: 'Easy on the eyes color scheme',
    price: 300,
    type: 'theme',
    category: 'cosmetics',
    themeId: 'solarized'
  },
  'matrix-theme': {
    name: 'Matrix Green Theme',
    description: 'Classic Matrix-style green on black',
    price: 300,
    type: 'theme',
    category: 'cosmetics',
    themeId: 'matrix'
  },
  'golden-frame': {
    name: 'Golden Profile Frame',
    description: 'Exclusive golden border for your profile',
    price: 800,
    type: 'cosmetic',
    category: 'cosmetics',
    frameId: 'golden'
  },
  'mystery-box': {
    name: 'Mystery Box',
    description: 'Random reward - could be coins, badges, or themes!',
    price: 300,
    type: 'mystery',
    category: 'mystery'
  }
};

// Achievement definitions
const ACHIEVEMENT_DEFINITIONS = {
  'bronze-tier': {
    name: 'Bronze Tier',
    description: 'Solve 10 problems',
    tier: 'bronze',
    target: 10,
    reward: { coins: 100, xp: 50 }
  },
  'silver-tier': {
    name: 'Silver Tier',
    description: 'Solve 50 problems',
    tier: 'silver',
    target: 50,
    reward: { coins: 300, xp: 150 }
  },
  'gold-tier': {
    name: 'Gold Tier',
    description: 'Solve 100 problems',
    tier: 'gold',
    target: 100,
    reward: { coins: 600, xp: 300, badge: 'century-club' }
  },
  'platinum-tier': {
    name: 'Platinum Tier',
    description: 'Solve 500 problems',
    tier: 'platinum',
    target: 500,
    reward: { coins: 2000, xp: 1000, badge: 'legendary-solver' }
  }
};

// GET /api/rewards/profile - Get user's rewards profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize rewards if not exists
    if (!user.rewards) {
      user.rewards = {
        coins: 100, // Starting coins
        xp: 0,
        level: 1,
        badges: [],
        ownedItems: [],
        activeBoosters: [],
        achievements: [],
        weeklyChallenges: [],
        monthlyChallenges: [],
        transactionHistory: [],
        dailyRewards: {
          lastClaimed: null,
          streak: 0,
          nextReward: 1
        },
        profileCustomization: {
          frameStyle: 'default',
          theme: 'default',
          avatar: null
        }
      };
      await user.save();
    }

    // Check and award badges
    await checkAndAwardBadges(user);
    
    // Check and update achievements
    await checkAndUpdateAchievements(user);
    
    // Save user after checking badges and achievements
    await user.save();

    res.json({
      coins: user.rewards.coins,
      xp: user.rewards.xp,
      level: user.rewards.level,
      badges: user.rewards.badges,
      ownedItems: user.rewards.ownedItems,
      activeBoosters: user.rewards.activeBoosters,
      achievements: user.rewards.achievements,
      weeklyChallenges: user.rewards.weeklyChallenges,
      monthlyChallenges: user.rewards.monthlyChallenges,
      profileCustomization: user.rewards.profileCustomization,
      dailyRewards: user.rewards.dailyRewards
    });
  } catch (error) {
    console.error('Rewards profile error:', error);
    res.status(500).json({ message: 'Failed to fetch rewards profile' });
  }
});

// GET /api/rewards/shop - Get shop items
router.get('/shop', authenticateToken, async (req, res) => {
  try {
    res.json({
      items: Object.entries(SHOP_ITEMS).map(([id, item]) => ({
        id,
        ...item
      }))
    });
  } catch (error) {
    console.error('Shop items error:', error);
    res.status(500).json({ message: 'Failed to fetch shop items' });
  }
});

// POST /api/rewards/purchase - Purchase item from shop
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const item = SHOP_ITEMS[itemId];
    if (!item) {
      return res.status(400).json({ message: 'Item not found' });
    }

    if (user.rewards.coins < item.price) {
      return res.status(400).json({ message: 'Insufficient coins' });
    }

    // Handle mystery box
    if (item.type === 'mystery') {
      const reward = await handleMysteryBox(user);
      user.rewards.coins -= item.price;
      user.rewards.transactionHistory.push({
        type: 'spent',
        amount: item.price,
        description: `Purchased ${item.name}`,
        source: 'shop'
      });
      await user.save();
      
      return res.json({
        message: 'Mystery box opened!',
        reward,
        newCoins: user.rewards.coins
      });
    }

    // Check if user already owns the item
    const alreadyOwned = user.rewards.ownedItems.some(owned => owned.itemId === itemId);
    if (alreadyOwned) {
      return res.status(400).json({ message: 'You already own this item' });
    }

    // Purchase item
    user.rewards.coins -= item.price;
    user.rewards.ownedItems.push({
      itemId,
      itemType: item.type,
      name: item.name,
      purchasedAt: new Date(),
      isActive: false
    });
    
    user.rewards.transactionHistory.push({
      type: 'spent',
      amount: item.price,
      description: `Purchased ${item.name}`,
      source: 'shop'
    });

    await user.save();

    res.json({
      message: 'Item purchased successfully',
      newCoins: user.rewards.coins
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ message: 'Failed to purchase item' });
  }
});

// POST /api/rewards/activate-booster - Activate a booster
router.post('/activate-booster', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ownedItem = user.rewards.ownedItems.find(item => item.itemId === itemId);
    if (!ownedItem) {
      return res.status(400).json({ message: 'Item not owned' });
    }

    const shopItem = SHOP_ITEMS[itemId];
    if (!shopItem || shopItem.type !== 'booster') {
      return res.status(400).json({ message: 'Not a valid booster' });
    }

    // Check if booster is already active
    const activeBooster = user.rewards.activeBoosters.find(booster => booster.boosterId === itemId);
    if (activeBooster) {
      return res.status(400).json({ message: 'Booster already active' });
    }

    // Calculate expiration time
    const expiresAt = new Date();
    if (shopItem.duration) {
      expiresAt.setTime(expiresAt.getTime() + shopItem.duration);
    } else if (shopItem.uses) {
      // For use-based boosters, set a longer expiration
      expiresAt.setTime(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    // Add active booster
    user.rewards.activeBoosters.push({
      boosterId: itemId,
      type: shopItem.boostType,
      multiplier: shopItem.multiplier,
      expiresAt,
      activatedAt: new Date()
    });

    await user.save();

    res.json({
      message: 'Booster activated successfully',
      expiresAt
    });
  } catch (error) {
    console.error('Activate booster error:', error);
    res.status(500).json({ message: 'Failed to activate booster' });
  }
});

// POST /api/rewards/claim-daily - Claim daily reward
router.post('/claim-daily', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastClaimed = user.rewards.dailyRewards.lastClaimed;
    const canClaim = !lastClaimed || lastClaimed < today;

    if (!canClaim) {
      return res.status(400).json({ message: 'Daily reward already claimed today' });
    }

    // Calculate reward based on streak
    const streak = user.rewards.dailyRewards.streak;
    const baseReward = 50;
    const streakBonus = Math.min(streak * 10, 200); // Max 200 bonus
    const totalReward = baseReward + streakBonus;

    // Award coins and XP
    user.rewards.coins += totalReward;
    user.rewards.xp += totalReward * 2;
    
    // Update daily reward data
    user.rewards.dailyRewards.lastClaimed = new Date();
    user.rewards.dailyRewards.streak = streak + 1;
    user.rewards.dailyRewards.nextReward = Math.min(user.rewards.dailyRewards.nextReward + 1, 7);

    // Add transaction
    user.rewards.transactionHistory.push({
      type: 'earned',
      amount: totalReward,
      description: `Daily reward (${streak + 1} day streak)`,
      source: 'daily'
    });

    // Check for level up
    const newLevel = calculateLevel(user.rewards.xp, user.rewards.coins);
    const leveledUp = newLevel > user.rewards.level;
    if (leveledUp) {
      user.rewards.level = newLevel;
      user.rewards.transactionHistory.push({
        type: 'reward',
        amount: 100,
        description: `Level up to ${newLevel}!`,
        source: 'levelup'
      });
      user.rewards.coins += 100;
    }

    await user.save();

    res.json({
      message: 'Daily reward claimed!',
      reward: totalReward,
      streak: user.rewards.dailyRewards.streak,
      newCoins: user.rewards.coins,
      newXp: user.rewards.xp,
      leveledUp,
      newLevel: user.rewards.level
    });
  } catch (error) {
    console.error('Claim daily error:', error);
    res.status(500).json({ message: 'Failed to claim daily reward' });
  }
});

// GET /api/rewards/leaderboard - Get leaderboards
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'coins' } = req.query;
    
    let sortField = 'rewards.coins';
    if (type === 'xp') sortField = 'rewards.xp';
    else if (type === 'streak') sortField = 'stats.longestStreak';
    else if (type === 'badges') sortField = 'rewards.badges';

    const users = await User.find({ 'rewards.coins': { $exists: true } })
      .select('username fullName rewards.coins rewards.xp rewards.badges stats.longestStreak')
      .sort({ [sortField]: -1 })
      .limit(10);

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      username: user.username || user.fullName,
      coins: user.rewards?.coins || 0,
      xp: user.rewards?.xp || 0,
      badges: user.rewards?.badges?.length || 0,
      streak: user.stats?.longestStreak || 0
    }));

    res.json({ leaderboard, type });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

// Helper functions
async function checkAndAwardBadges(user) {
  for (const [badgeId, badgeDef] of Object.entries(BADGE_DEFINITIONS)) {
    const alreadyEarned = user.rewards.badges.some(badge => badge.badgeId === badgeId);
    if (!alreadyEarned && badgeDef.condition(user)) {
      user.rewards.badges.push({
        badgeId,
        name: badgeDef.name,
        description: badgeDef.description,
        rarity: badgeDef.rarity,
        earnedAt: new Date(),
        category: badgeDef.category
      });

      // Award coins for badge
      const badgeReward = getBadgeReward(badgeDef.rarity);
      user.rewards.coins += badgeReward;
      user.rewards.xp += badgeReward * 2;

      user.rewards.transactionHistory.push({
        type: 'reward',
        amount: badgeReward,
        description: `Earned badge: ${badgeDef.name}`,
        source: 'badge'
      });
    }
  }
}

async function checkAndUpdateAchievements(user) {
  for (const [achievementId, achievementDef] of Object.entries(ACHIEVEMENT_DEFINITIONS)) {
    let existingAchievement = user.rewards.achievements.find(a => a.achievementId === achievementId);
    
    if (!existingAchievement) {
      existingAchievement = {
        achievementId,
        name: achievementDef.name,
        description: achievementDef.description,
        tier: achievementDef.tier,
        progress: 0,
        target: achievementDef.target,
        completed: false,
        reward: achievementDef.reward
      };
      user.rewards.achievements.push(existingAchievement);
    }

    if (!existingAchievement.completed) {
      existingAchievement.progress = user.solvedProblems.length;
      
      if (existingAchievement.progress >= existingAchievement.target) {
        existingAchievement.completed = true;
        existingAchievement.completedAt = new Date();
        
        // Award rewards
        user.rewards.coins += existingAchievement.reward.coins;
        user.rewards.xp += existingAchievement.reward.xp;
        
        user.rewards.transactionHistory.push({
          type: 'reward',
          amount: existingAchievement.reward.coins,
          description: `Achievement: ${existingAchievement.name}`,
          source: 'achievement'
        });
      }
    }
  }
}

async function handleMysteryBox(user) {
  const rewards = [
    { type: 'coins', amount: 100, probability: 0.4 },
    { type: 'coins', amount: 200, probability: 0.2 },
    { type: 'coins', amount: 500, probability: 0.1 },
    { type: 'xp', amount: 200, probability: 0.2 },
    { type: 'badge', badgeId: 'lucky', probability: 0.05 },
    { type: 'theme', themeId: 'mystery', probability: 0.05 }
  ];

  const random = Math.random();
  let cumulativeProbability = 0;
  
  for (const reward of rewards) {
    cumulativeProbability += reward.probability;
    if (random <= cumulativeProbability) {
      if (reward.type === 'coins') {
        user.rewards.coins += reward.amount;
        return { type: 'coins', amount: reward.amount };
      } else if (reward.type === 'xp') {
        user.rewards.xp += reward.amount;
        return { type: 'xp', amount: reward.amount };
      } else if (reward.type === 'badge') {
        // Add special mystery badge
        user.rewards.badges.push({
          badgeId: 'lucky',
          name: 'Lucky',
          description: 'Won from a mystery box!',
          rarity: 'rare',
          earnedAt: new Date(),
          category: 'special'
        });
        return { type: 'badge', name: 'Lucky' };
      } else if (reward.type === 'theme') {
        // Add mystery theme
        user.rewards.ownedItems.push({
          itemId: 'mystery-theme',
          itemType: 'theme',
          name: 'Mystery Theme',
          purchasedAt: new Date(),
          isActive: false
        });
        return { type: 'theme', name: 'Mystery Theme' };
      }
    }
  }
  
  // Fallback
  user.rewards.coins += 50;
  return { type: 'coins', amount: 50 };
}

function getBadgeReward(rarity) {
  const rewards = {
    'common': 25,
    'rare': 50,
    'epic': 100,
    'legendary': 200,
    'mythic': 500
  };
  return rewards[rarity] || 25;
}

function calculateLevel(xp, coins) {
  const totalProgressPoints = (Number(xp) || 0) + (Number(coins) || 0) * 5;
  return Math.floor(totalProgressPoints / 1000) + 1;
}

module.exports = router;
