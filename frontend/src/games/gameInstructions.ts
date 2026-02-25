/**
 * Game instructions for students and instructors.
 * Each game type maps to student-facing rules and instructor-facing technical notes.
 */

export interface GameInstructionSet {
  studentInstructions: {
    premise: string;
    yourGoal: string;
    howToPlay: string[];
    tips?: string[];
  };
  instructorNotes: {
    payoffFunctions: string[];
    equilibrium?: string;
    keyParameters: string[];
    teachingNotes?: string[];
  };
}

export const gameInstructions: Record<string, GameInstructionSet> = {
  double_auction: {
    studentInstructions: {
      premise:
        'You are in a market with buyers and sellers. Buyers have private valuations (the most they are willing to pay), and sellers have private costs (the least they are willing to accept).',
      yourGoal:
        'Maximize your profit by trading at favorable prices. Buyers want to buy low; sellers want to sell high.',
      howToPlay: [
        'Buyers submit bids (offers to buy) and sellers submit asks (offers to sell).',
        'A trade happens automatically when a bid meets or exceeds an ask.',
        'The trade price is set at the price of the earlier order.',
        'Buyer profit = Your Valuation - Trade Price.',
        'Seller profit = Trade Price - Your Cost.',
        'You can submit multiple bids/asks per round, but each player can only complete one trade per round.',
      ],
      tips: [
        'Don\'t bid above your valuation (buyers) or ask below your cost (sellers) — you\'d lose money.',
        'Watch the order book to gauge where the market is trading.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Buyer profit = Valuation - Trade Price',
        'Seller profit = Trade Price - Production Cost',
      ],
      equilibrium:
        'Competitive equilibrium price occurs where supply meets demand. With uniform valuation/cost distributions, this is near the midpoint of the overlapping range.',
      keyParameters: [
        'Valuation range (min/max/increment) — defines the demand curve',
        'Cost range (min/max/increment) — defines the supply curve',
        'Market size — number of buyers + sellers',
        'Time per round — longer rounds allow more price discovery',
      ],
      teachingNotes: [
        'Markets typically converge to the competitive equilibrium within 3-5 rounds.',
        'Compare the observed average price to the theoretical equilibrium price.',
        'Total surplus = sum of all buyer + seller profits. Compare to maximum possible surplus.',
      ],
    },
  },

  double_auction_tax: {
    studentInstructions: {
      premise:
        'This is a double auction market (buyers and sellers trading), but the government has imposed a per-unit tax or subsidy on trades.',
      yourGoal:
        'Maximize your profit by trading, keeping in mind that the tax/subsidy changes the effective price you pay or receive.',
      howToPlay: [
        'Trading works the same as a standard double auction — submit bids or asks.',
        'If there is a tax on buyers: your effective cost is the trade price PLUS the tax.',
        'If there is a tax on sellers: your effective revenue is the trade price MINUS the tax.',
        'A negative tax amount means a subsidy (you receive money instead of paying).',
        'Buyer profit = Valuation - Trade Price - Tax (if tax is on buyers).',
        'Seller profit = Trade Price - Cost - Tax (if tax is on sellers).',
      ],
      tips: [
        'The tax creates a "wedge" between what the buyer pays and what the seller receives.',
        'Think about how the tax changes the price at which you can still profit.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Tax on buyer: Buyer profit = Valuation - Price - Tax; Seller profit = Price - Cost',
        'Tax on seller: Buyer profit = Valuation - Price; Seller profit = Price - Tax - Cost',
      ],
      equilibrium:
        'The tax creates a wedge between buyer price and seller price. Trading volume falls. Tax incidence depends on relative elasticities of supply and demand.',
      keyParameters: [
        'taxType — whether the tax falls on buyers or sellers',
        'taxAmount — positive = tax, negative = subsidy',
        'Standard DA parameters (valuations, costs, market size)',
      ],
      teachingNotes: [
        'Key lesson: tax incidence is independent of who nominally pays the tax.',
        'Compare volume and surplus with vs. without the tax.',
        'Deadweight loss = surplus reduction from reduced trading volume.',
        'Try running the same market first without tax, then with tax, to show the effect.',
      ],
    },
  },

  double_auction_price_controls: {
    studentInstructions: {
      premise:
        'This is a double auction market, but the government has imposed a price control — either a price ceiling (maximum price) or a price floor (minimum price).',
      yourGoal:
        'Maximize your profit by trading within the price limits. Some trades that would have happened may now be blocked.',
      howToPlay: [
        'Trading works the same as a standard double auction.',
        'Price ceiling: no trade can occur above the ceiling price. Bids and asks above the ceiling are rejected.',
        'Price floor: no trade can occur below the floor price. Bids and asks below the floor are rejected.',
        'Profit calculations are the same as a standard double auction.',
      ],
      tips: [
        'A binding price ceiling (below equilibrium) creates excess demand — more buyers want to trade than can.',
        'A binding price floor (above equilibrium) creates excess supply — more sellers want to trade than can.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Same as standard DA: Buyer profit = Valuation - Price; Seller profit = Price - Cost',
        'But trades are restricted to prices at or within the control limit.',
      ],
      equilibrium:
        'A binding price ceiling below the competitive equilibrium reduces quantity traded and creates a shortage. A binding price floor above equilibrium creates a surplus.',
      keyParameters: [
        'controlType — "ceiling" or "floor"',
        'controlPrice — the enforced price limit',
        'Standard DA parameters (valuations, costs, market size)',
      ],
      teachingNotes: [
        'Set the control price to be binding (below equilibrium for ceiling, above for floor).',
        'Compare trading volume and total surplus with vs. without the control.',
        'Discuss who gains and who loses from the price control.',
        'Good to run the base DA game first, then add the control to show the distortion.',
      ],
    },
  },

  bertrand: {
    studentInstructions: {
      premise:
        'You are a firm competing with other firms by setting prices. All firms sell identical products. Consumers buy from whichever firm offers the lowest price.',
      yourGoal:
        'Maximize your profit by choosing the right price. Set it too high and you lose all customers; set it too low and your margin disappears.',
      howToPlay: [
        'Each round, you simultaneously choose a price for your product.',
        'The firm(s) with the lowest price capture ALL market demand.',
        'If multiple firms tie for the lowest price, they split the demand equally.',
        'Firms that don\'t have the lowest price sell nothing and earn $0.',
        'Your profit = (Your Price - Marginal Cost) x Quantity Sold.',
      ],
      tips: [
        'If you undercut your rivals by even $1, you win the entire market.',
        'But if everyone undercuts, prices race to the bottom.',
        'Think about what price your competitors will choose.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Winner profit = (Price - MC) x (Market Demand / Number of Winners)',
        'Loser profit = 0',
      ],
      equilibrium:
        'Nash equilibrium: all firms set Price = Marginal Cost (Bertrand paradox). With only 2 firms, the competitive outcome is achieved. Profit = 0 in equilibrium.',
      keyParameters: [
        'marginalCost — cost per unit (all firms share the same cost)',
        'marketDemand — total units consumers want to buy',
        'maxPrice — upper limit on prices',
        'Number of firms',
      ],
      teachingNotes: [
        'Demonstrates the Bertrand paradox: even with just 2 firms, prices converge to marginal cost.',
        'Students often start with high prices and gradually undercut each other.',
        'Compare observed prices to the Nash prediction of P = MC.',
        'Discuss why real-world firms with identical products might still earn profits (differentiation, capacity constraints, collusion).',
      ],
    },
  },

  cournot: {
    studentInstructions: {
      premise:
        'You are a firm competing with other firms by choosing how much to produce. The more all firms produce in total, the lower the market price.',
      yourGoal:
        'Maximize your profit by choosing the right production quantity. Produce too much and the price drops; produce too little and you miss revenue.',
      howToPlay: [
        'Each round, you simultaneously choose a production quantity.',
        'The market price is determined by total output: P = a - b x Total Quantity.',
        'Your revenue = Market Price x Your Quantity.',
        'Your cost = Marginal Cost x Your Quantity.',
        'Your profit = Revenue - Cost.',
        'After all firms submit, you see the market price and everyone\'s results.',
      ],
      tips: [
        'If other firms produce a lot, the price drops — you may want to produce less.',
        'If other firms produce little, there\'s room for you to produce more profitably.',
        'The key is to anticipate what others will do.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Market Price: P = a - b x Q_total',
        'Firm profit: (P - c) x q_i = (a - b x Q_total - c) x q_i',
      ],
      equilibrium:
        'Cournot-Nash equilibrium: each firm produces q* = (a - c) / (b x (n + 1)), where n = number of firms. Total output = n x q*. As n increases, output approaches the competitive level.',
      keyParameters: [
        'demandIntercept (a) — maximum willingness to pay when Q = 0',
        'demandSlope (b) — price sensitivity to quantity',
        'marginalCost (c) — cost per unit',
        'Number of firms (n)',
      ],
      teachingNotes: [
        'Compare observed quantities to the Cournot-Nash prediction.',
        'As the number of firms increases, the outcome should approach perfect competition.',
        'Students often over-produce (competition instinct) or collude tacitly.',
        'Try varying the number of firms across sessions to show convergence to competitive outcome.',
      ],
    },
  },

  public_goods: {
    studentInstructions: {
      premise:
        'You are part of a group. Each round, everyone receives an endowment of tokens and decides how much to contribute to a shared public good. Contributions are multiplied and shared equally among all group members.',
      yourGoal:
        'Maximize your earnings. You keep tokens you don\'t contribute, but everyone benefits when the group contributes more.',
      howToPlay: [
        'Each round, you receive an endowment (e.g., 20 tokens).',
        'Choose how many tokens to contribute to the public good (0 to your full endowment).',
        'All contributions are added up, multiplied by the MPCR (e.g., 0.4), and the result is shared equally.',
        'Your earnings = Tokens you kept + Your share of the public good return.',
      ],
      tips: [
        'If everyone contributes everything, the group earns the most total.',
        'But individually, you always earn more by keeping your tokens (free-riding).',
        'This is the classic "free-rider problem" — what will you do?',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Payoff_i = (Endowment - Contribution_i) + MPCR x Sum(All Contributions)',
      ],
      equilibrium:
        'Nash equilibrium: contribute 0 (if MPCR < 1). Social optimum: contribute everything (if MPCR x N > 1). The tension between individual and group incentives is the core lesson.',
      keyParameters: [
        'endowment — tokens per player per round',
        'mpcr — Marginal Per-Capita Return (multiplier on contributions)',
        'Group size (N) — MPCR x N > 1 makes full contribution socially optimal',
      ],
      teachingNotes: [
        'Contributions typically start at 40-60% and decline over rounds as free-riding increases.',
        'Track average contribution per round to show the declining trend.',
        'Compare total group earnings to the social optimum (everyone contributes all).',
        'Discuss real-world public goods: national defense, clean air, open-source software.',
      ],
    },
  },

  negative_externality: {
    studentInstructions: {
      premise:
        'You are a firm that earns private profit from production, but your production also creates pollution that harms everyone (including yourself). The more all firms produce, the greater the total damage.',
      yourGoal:
        'Maximize your net profit after accounting for your share of the environmental damage.',
      howToPlay: [
        'Each round, choose how many units to produce.',
        'You earn private profit from production: (Revenue per Unit - Cost per Unit) x Your Quantity.',
        'Total damage = Damage Rate x (Total Production)^2, shared equally among all firms.',
        'Your net profit = Private Profit - Your Share of Damage.',
        'If a Pigouvian tax is enabled, you also pay tax per unit but receive an equal share of total tax revenue.',
      ],
      tips: [
        'You\'d produce more if you only cared about private profit.',
        'But damage rises with the SQUARE of total production — it grows fast.',
        'The socially optimal production level is lower than the private optimum.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Private profit = (Revenue/unit - Cost/unit) x q_i',
        'Total damage = damageRate x Q_total^2',
        'Net profit (no tax) = Private profit - (Total damage / N)',
        'Net profit (with tax) = Private profit - tax x q_i + (Total tax revenue / N)',
      ],
      equilibrium:
        'Without tax: firms over-produce relative to the social optimum because they don\'t bear the full cost of their pollution. With optimal Pigouvian tax: firms internalize the externality and produce the socially efficient amount.',
      keyParameters: [
        'revenuePerUnit — gross revenue per unit produced',
        'costPerUnit — private production cost per unit',
        'damageRate — coefficient in damage = rate x Q^2',
        'taxEnabled / taxRate — optional Pigouvian tax',
      ],
      teachingNotes: [
        'Run first without tax, then with tax to show the correction.',
        'Optimal tax = marginal social damage at the efficient quantity.',
        'Compare total surplus (private profit minus damage) with and without tax.',
        'Relates to carbon taxes, pollution permits, and environmental policy.',
      ],
    },
  },

  ultimatum: {
    studentInstructions: {
      premise:
        'You are paired with another player to split a sum of money. One player (the Proposer) makes an offer, and the other (the Responder) either accepts or rejects it.',
      yourGoal:
        'Proposers: keep as much as possible while still having your offer accepted. Responders: decide whether to accept the offer or reject it (both get $0).',
      howToPlay: [
        'Proposers go first: offer an amount to the Responder (from the total endowment).',
        'Responders see the offer and choose to ACCEPT or REJECT.',
        'If accepted: the Proposer keeps the rest, and the Responder receives the offered amount.',
        'If rejected: BOTH players earn $0 for that round.',
      ],
      tips: [
        'Rational self-interest says Responders should accept any positive offer.',
        'But in practice, people reject offers they consider unfair.',
        'As a Proposer, think about what the Responder considers "fair enough" to accept.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Accept: Proposer profit = Endowment - Offer; Responder profit = Offer',
        'Reject: Both earn $0',
      ],
      equilibrium:
        'Subgame perfect NE: Proposer offers the minimum amount, Responder accepts. In practice, modal offers are 40-50% of the endowment, and low offers (< 20%) are frequently rejected.',
      keyParameters: [
        'endowment — total amount to be split',
        'minOffer — minimum allowed offer',
      ],
      teachingNotes: [
        'Classic demonstration of fairness concerns overriding pure self-interest.',
        'Compare the distribution of offers to the theoretical prediction.',
        'Track rejection rates by offer level to show the "fairness threshold."',
        'Discuss cultural differences in ultimatum game outcomes.',
      ],
    },
  },

  gift_exchange: {
    studentInstructions: {
      premise:
        'You are in a labor market. Employers offer wages, then workers choose how much effort to exert. Higher effort is costly for workers but produces more output for employers.',
      yourGoal:
        'Employers: offer a wage that motivates high effort. Workers: choose effort that balances your cost against rewarding generous wages.',
      howToPlay: [
        'Employers go first: offer a wage to your matched worker.',
        'Workers see the wage and choose an effort level (1 to max effort).',
        'Employer profit = Effort x Productivity Multiplier - Wage paid.',
        'Worker profit = Wage received - Effort Cost (higher effort = higher cost).',
        'Effort cost increases quadratically — doubling effort more than doubles the cost.',
      ],
      tips: [
        'Workers: minimum effort costs almost nothing. Maximum effort is expensive.',
        'Employers: higher wages don\'t guarantee higher effort, but they often do (reciprocity).',
        'This game tests whether "gift exchange" occurs — do workers reward generosity?',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Employer profit = Effort x Productivity Multiplier - Wage',
        'Worker profit = Wage - Effort Cost',
        'Effort cost = (effort / maxEffort)^2 x maxEffortCost (quadratic)',
      ],
      equilibrium:
        'Subgame perfect NE: workers choose minimum effort (since effort is costly and wage is sunk), so employers offer minimum wage. In practice, positive wage-effort correlations are commonly observed (reciprocity / gift exchange).',
      keyParameters: [
        'maxWage — maximum wage an employer can offer',
        'maxEffort — maximum effort level',
        'productivityMultiplier — output per unit of effort',
        'maxEffortCost — cost at maximum effort',
      ],
      teachingNotes: [
        'Plot wage vs. effort to show the reciprocity relationship.',
        'Compare actual effort levels to the Nash prediction (minimum effort).',
        'Demonstrates Akerlof\'s "gift exchange" / efficiency wage theory.',
        'Discuss implications for real labor markets and employee motivation.',
      ],
    },
  },

  principal_agent: {
    studentInstructions: {
      premise:
        'A Principal (employer) hires an Agent (worker) but cannot directly observe the Agent\'s effort. The Principal designs a contract with a fixed wage and a bonus for high output. The Agent then chooses whether to exert high or low effort.',
      yourGoal:
        'Principals: design a contract that motivates high effort and still earns you a profit. Agents: choose the effort level that maximizes your earnings given the contract.',
      howToPlay: [
        'Principals go first: set a fixed wage and a bonus (paid only if output is high).',
        'Agents see the contract and choose high effort or low effort.',
        'High effort is costly but increases the probability of high output.',
        'Output is then randomly determined based on the effort-dependent probability.',
        'Principal profit = Output Value - Wage - Bonus (if high output).',
        'Agent profit = Wage + Bonus (if high output) - Effort Cost (if high effort).',
      ],
      tips: [
        'Agents: high effort costs you, but the bonus may make it worthwhile.',
        'Principals: a bigger bonus incentivizes high effort but costs you more when output is high.',
        'Think about expected values — the probabilities matter!',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Principal profit = Output - Fixed Wage - Bonus (if high output)',
        'Agent profit = Fixed Wage + Bonus (if high output) - Effort Cost (if high effort)',
        'Prob(High Output | High Effort) = highEffortProb (default 0.8)',
        'Prob(High Output | Low Effort) = lowEffortProb (default 0.2)',
      ],
      equilibrium:
        'Agent chooses high effort if: E[payoff|high] > E[payoff|low], i.e., Bonus x (highEffortProb - lowEffortProb) > effortCost. The principal\'s optimal contract balances incentive provision against cost.',
      keyParameters: [
        'highOutput / lowOutput — output values',
        'highEffortProb / lowEffortProb — probability of high output by effort level',
        'effortCost — cost of high effort to the agent',
        'maxWage / maxBonus — contract limits',
      ],
      teachingNotes: [
        'Core concept: moral hazard — effort is unobservable.',
        'Calculate the minimum bonus needed to induce high effort.',
        'Compare actual contract offers to the theoretical optimal.',
        'Discuss real-world examples: CEO compensation, insurance deductibles, salesforce incentives.',
      ],
    },
  },

  comparative_advantage: {
    studentInstructions: {
      premise:
        'You represent a country with a fixed amount of labor to allocate between producing two goods. Different countries have different productivities — some are better at making one good than the other.',
      yourGoal:
        'Maximize your utility (well-being) by allocating your labor wisely. Your utility depends on how much of BOTH goods you produce.',
      howToPlay: [
        'Each round, allocate your labor between Good 1 and Good 2.',
        'Your production of each good = labor allocated x your productivity for that good.',
        'Your utility = square root of (Good 1 produced x Good 2 produced).',
        'Countries with even-numbered positions are better at Good 1; odd-numbered are better at Good 2.',
      ],
      tips: [
        'Splitting labor 50/50 is one strategy, but is it the best?',
        'Think about what you\'re relatively better at producing (your comparative advantage).',
        'In this simplified version, you consume what you produce — specialization helps when trade is possible.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Good 1 produced = laborGood1 x productivity1',
        'Good 2 produced = (totalLabor - laborGood1) x productivity2',
        'Utility = sqrt(Good1 x Good2) (Cobb-Douglas with equal weights)',
      ],
      equilibrium:
        'Under autarky, the optimal split equalizes the marginal utility of labor across goods. With trade, countries should specialize in their comparative advantage good and trade for the other.',
      keyParameters: [
        'laborUnits — total labor per country',
        'Productivity assignments are automatic: alternating 2:1 and 1:2',
        'good1Name / good2Name — cosmetic labels',
      ],
      teachingNotes: [
        'Compare autarky utility (50/50 split) vs. specialized production.',
        'The current implementation is autarky-only (no actual trade mechanism).',
        'Discuss how trade would increase utility for both countries.',
        'Relates to Ricardian model of comparative advantage.',
      ],
    },
  },

  monopoly: {
    studentInstructions: {
      premise:
        'You are the only seller in a market (a monopolist). You face a downward-sloping demand curve — the higher your price, the fewer units consumers buy.',
      yourGoal:
        'Find the price that maximizes your profit. Balance selling at a high price (high margin per unit) against selling more units (lower price).',
      howToPlay: [
        'Each round, you choose a price for your product.',
        'The quantity demanded at your price is calculated from the demand curve: Q = (a - P) / b.',
        'Your revenue = Price x Quantity demanded.',
        'Your cost = Marginal Cost x Quantity + Fixed Cost.',
        'Your profit = Revenue - Cost.',
        'After submitting, you see the optimal monopoly price for comparison.',
      ],
      tips: [
        'The profit-maximizing price is where Marginal Revenue = Marginal Cost.',
        'Setting price too high means very few sales; too low means low margins.',
        'The game shows you the optimal price after each round — try to get closer!',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Inverse demand: P = a - b x Q',
        'Quantity demanded: Q = (a - P) / b',
        'Profit = P x Q - MC x Q - FC',
        'Marginal Revenue: MR = a - 2b x Q',
      ],
      equilibrium:
        'Monopoly optimum: MR = MC, so Q* = (a - MC) / (2b), P* = (a + MC) / 2. Compare to competitive outcome: Q_c = (a - MC) / b, P_c = MC. Deadweight loss = 0.5 x (P* - MC) x (Q_c - Q*).',
      keyParameters: [
        'demandIntercept (a) — maximum willingness to pay',
        'demandSlope (b) — price sensitivity',
        'marginalCost (MC)',
        'fixedCost (FC)',
      ],
      teachingNotes: [
        'Each player operates on their own independent market (to compare strategies).',
        'Compare student-chosen prices to the theoretical monopoly optimum.',
        'Show consumer surplus and deadweight loss in results.',
        'Discuss why monopolies are inefficient and how regulation might help.',
      ],
    },
  },

  market_for_lemons: {
    studentInstructions: {
      premise:
        'You are in a used car market. Sellers know the true quality of their car, but buyers do NOT. Sellers set prices; buyers decide whether to buy based on price alone.',
      yourGoal:
        'Sellers: set a price that earns you a profit given your car\'s quality. Buyers: decide if the price is worth the risk of unknown quality.',
      howToPlay: [
        'Sellers are assigned a random car quality (unknown to the buyer).',
        'Sellers see their car\'s quality and set an asking price.',
        'Buyers see the price but NOT the quality, then choose to Buy or Pass.',
        'If the buyer buys: Seller profit = Price - Seller Cost. Buyer profit = Buyer Value - Price.',
        'If the buyer passes: both earn $0 for that round.',
        'Seller cost = Quality x Seller Cost Fraction. Buyer value = Quality x Buyer Value Fraction.',
      ],
      tips: [
        'Sellers: high-quality cars cost you more but are worth more to buyers.',
        'Buyers: since you can\'t see quality, you have to guess the average quality at each price.',
        'Notice what happens over time — do high-quality sellers drop out of the market?',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Seller cost = Quality x sellerCostFraction',
        'Buyer value = Quality x buyerValueFraction',
        'Trade: Seller profit = Price - Seller Cost; Buyer profit = Buyer Value - Price',
        'No trade: Both earn $0',
      ],
      equilibrium:
        'With asymmetric information, adverse selection can cause market unraveling: buyers lower their willingness to pay, causing high-quality sellers to exit, which further lowers expected quality. In the extreme, only the lowest-quality goods ("lemons") trade.',
      keyParameters: [
        'Quality levels — randomly assigned from [10, 20, ..., 90]',
        'sellerCostFraction — seller cost as a fraction of quality (default 0.5)',
        'buyerValueFraction — buyer value as a fraction of quality (default 1.5)',
      ],
      teachingNotes: [
        'Track what quality levels actually trade and which are rejected.',
        'Look for evidence of market unraveling — do high-quality goods stop being offered?',
        'Compare to full-information benchmark: all trades with buyer value > seller cost should occur.',
        'Discuss solutions: warranties, inspection, signaling, reputation.',
        'Akerlof (1970) "The Market for Lemons" — Nobel Prize-winning paper.',
      ],
    },
  },

  discovery_process: {
    studentInstructions: {
      premise:
        'You are a person in a small village economy. You and others each have a field that produces colored goods and a house where goods are stored. Each period has a production phase and a move phase.',
      yourGoal:
        'Maximize your earnings by producing goods and getting the right combination of goods into your house. Earnings depend on having complete "sets" of goods in your house at the end of each period.',
      howToPlay: [
        'During the Production Phase, use the slider to decide how to split your production time between goods. Click "Start Production" when ready.',
        'Your field produces goods automatically based on your slider setting and your production function.',
        'During the Move Phase, click on goods in your field or house to select them, then click on a house (yours or another player\'s) to move them there.',
        'Goods in your HOUSE count toward earnings. Goods left in your field do NOT earn anything.',
        'Earnings = number of complete sets of goods in your house × earning amount per set.',
        'Leftover goods that don\'t form complete sets are wasted.',
        'Use the chat to communicate with other players.',
      ],
      tips: [
        'Pay attention to which goods you produce most efficiently — that is your comparative advantage.',
        'Moving goods to another player\'s house is how you trade. Consider specializing and exchanging.',
        'Look at what other players are producing and try to find mutually beneficial trades.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Production: output = P1 + P2 × time^P3 (per good, per player type)',
        'Earnings: floor(min(good_i / required_i for all goods)) × earning_amount_per_set',
      ],
      equilibrium:
        'At competitive equilibrium, each player type specializes in the good for which they have comparative advantage and trades with others. Earnings at CE are typically 3x autarky earnings.',
      keyParameters: [
        'Production length (seconds) — time for production phase (default 10)',
        'Move length (seconds) — time for trading/move phase (default 90)',
        'Player type production functions (P1, P2, P3 per good) — determines comparative advantage',
        'Earning requirements per type — how many of each good needed per "set"',
        'Allow stealing — whether players can take from others\' houses',
        'Chat settings — group and/or private chat',
      ],
      teachingNotes: [
        'Based on Crockett, Smith & Wilson (2009) "Exchange and Specialisation as a Discovery Process".',
        'Key insight: players must DISCOVER that they can move goods to others — trading is not explicitly explained.',
        'Watch for emergence of bilateral trading relationships and specialization.',
        'Near-full efficiency typically occurs through stable "monogamous" trading pairs.',
        'Compare actual earnings to autarky (self-sufficient) and competitive equilibrium benchmarks.',
        'Many subjects do NOT fully specialize even though it would maximize total surplus.',
      ],
    },
  },

  prisoner_dilemma: {
    studentInstructions: {
      premise:
        'You are paired with other players in a social dilemma. Each round, you simultaneously choose to Cooperate or Defect without knowing what others will do.',
      yourGoal:
        'Maximize your total earnings across all rounds. Mutual cooperation pays well, but defecting when others cooperate pays even more.',
      howToPlay: [
        'Each round, choose either Cooperate or Defect.',
        'Your payoff depends on your choice AND what others chose.',
        'If both you and your partner cooperate, you each earn the Reward payoff.',
        'If you defect while your partner cooperates, you earn the Temptation payoff (highest) and they earn the Sucker payoff (lowest).',
        'If both defect, you each earn the Punishment payoff.',
        'In groups larger than 2, your payoff is averaged across all pairings.',
      ],
      tips: [
        'The dominant strategy (best individual response) is to defect — but mutual defection is worse than mutual cooperation.',
        'In repeated rounds, cooperation can be sustained through reciprocity.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Both Cooperate: each gets R (Reward)',
        'Both Defect: each gets P (Punishment)',
        'Cooperate vs Defect: cooperator gets S (Sucker), defector gets T (Temptation)',
        'Payoff ordering: T > R > P > S',
      ],
      equilibrium:
        'The unique Nash equilibrium is (Defect, Defect). Mutual cooperation is Pareto-superior but not a Nash equilibrium.',
      keyParameters: [
        'reward — payoff for mutual cooperation (default 3)',
        'temptation — payoff for defecting against a cooperator (default 5)',
        'sucker — payoff for cooperating against a defector (default 0)',
        'punishment — payoff for mutual defection (default 1)',
      ],
      teachingNotes: [
        'Classic illustration of the tension between individual and collective rationality.',
        'Compare cooperation rates across rounds — do students learn to cooperate or defect?',
        'Discuss real-world analogues: arms races, climate agreements, cartel stability.',
      ],
    },
  },

  beauty_contest: {
    studentInstructions: {
      premise:
        'All players simultaneously choose a number. The winner is the player whose number is closest to a fraction (e.g., 2/3) of the group average.',
      yourGoal:
        'Choose the number closest to the target fraction of the group average to win the prize.',
      howToPlay: [
        'Choose a number between 0 and the maximum (e.g., 100).',
        'All numbers are revealed simultaneously.',
        'The group average is calculated, then multiplied by the target fraction (e.g., 2/3).',
        'The player(s) closest to this target number win the prize.',
        'Ties split the prize equally.',
      ],
      tips: [
        'If everyone picks 50, the target would be 33.3 — so 50 is too high.',
        'But if everyone thinks this way and picks 33, the target is 22 — so 33 is too high.',
        'The logic continues: the Nash equilibrium is 0, but most people don\'t reason that far.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Winner profit = Prize / (number of winners)',
        'Loser profit = 0',
        'Target = fraction × average of all chosen numbers',
      ],
      equilibrium:
        'The unique Nash equilibrium is for all players to choose 0 (iterated elimination of dominated strategies). In practice, first-round choices average around 33.',
      keyParameters: [
        'maxNumber — upper bound on choices (default 100)',
        'fraction — target fraction of average (default 2/3 ≈ 0.667)',
        'prize — amount the winner receives (default 10)',
      ],
      teachingNotes: [
        'Named after Keynes\'s beauty contest metaphor for financial markets.',
        'Track the group average across rounds — it should decline toward 0.',
        'Level-k reasoning: Level-0 picks randomly (~50), Level-1 picks 33, Level-2 picks 22, etc.',
      ],
    },
  },

  trust_game: {
    studentInstructions: {
      premise:
        'You are paired with another player. The Sender has an endowment and decides how much to send to the Receiver. The amount sent is multiplied (e.g., tripled). The Receiver then decides how much to return.',
      yourGoal:
        'Senders: maximize your earnings by deciding how much to trust. Receivers: decide how much to reciprocate.',
      howToPlay: [
        'Senders start with an endowment (e.g., $10).',
        'The Sender chooses how much to send (0 to endowment).',
        'The amount sent is multiplied (e.g., ×3) before reaching the Receiver.',
        'The Receiver sees the multiplied amount and chooses how much to return (0 to multiplied amount).',
        'Sender profit = Endowment - Amount Sent + Amount Returned.',
        'Receiver profit = Amount Sent × Multiplier - Amount Returned.',
      ],
      tips: [
        'Sending more shows trust and creates a larger total surplus.',
        'The Receiver has no material incentive to return anything — but most do.',
        'Think about how trust affects economic outcomes.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Sender profit = Endowment - Sent + Returned',
        'Receiver profit = Sent × Multiplier - Returned',
        'Total surplus = Endowment + Sent × (Multiplier - 1)',
      ],
      equilibrium:
        'By backward induction, the Receiver returns 0, so the Sender sends 0. In practice, Senders typically send 40-60% and Receivers return about 30-40% of the tripled amount.',
      keyParameters: [
        'endowment — starting amount for the Sender (default 10)',
        'multiplier — how much the sent amount is multiplied (default 3)',
      ],
      teachingNotes: [
        'Measures trust (amount sent) and reciprocity (proportion returned).',
        'Compare to the subgame-perfect equilibrium of sending and returning nothing.',
        'Discuss how institutions and social norms affect trust in real economies.',
      ],
    },
  },

  auction: {
    studentInstructions: {
      premise:
        'You are a bidder in a sealed-bid auction. You have a private value for the item — the most it is worth to you. You submit one sealed bid without seeing others\' bids.',
      yourGoal:
        'Win the item at a price below your value to earn a positive profit. Balance bidding high enough to win against bidding low enough to profit.',
      howToPlay: [
        'You receive a private value for the item (visible only to you).',
        'Submit a sealed bid — all bids are revealed simultaneously.',
        'The highest bidder wins the item.',
        'First-price auction: the winner pays their own bid.',
        'Second-price auction: the winner pays the second-highest bid.',
        'Winner profit = Your Value - Price Paid. All others earn $0.',
      ],
      tips: [
        'In a first-price auction, bid below your value — the margin is your profit.',
        'In a second-price auction, bidding exactly your value is the dominant strategy.',
        'Never bid above your value — you\'d lose money if you win!',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'First-price: Winner profit = Value - Own Bid',
        'Second-price: Winner profit = Value - Second-Highest Bid',
        'Loser profit = 0',
      ],
      equilibrium:
        'Second-price: Truthful bidding (bid = value) is a dominant strategy. First-price: Equilibrium bid = value × (n-1)/n for uniform values, where n is the number of bidders.',
      keyParameters: [
        'auctionType — first_price or second_price',
        'valueMin / valueMax — range for private value draws',
      ],
      teachingNotes: [
        'Revenue equivalence theorem: expected revenue is the same across auction formats.',
        'First-price auctions typically show bid shading (bids below value).',
        'Second-price auctions test whether students discover the dominant strategy.',
        'Compare observed revenue across formats to test revenue equivalence.',
      ],
    },
  },

  bargaining: {
    studentInstructions: {
      premise:
        'You are negotiating with a partner over how to divide a pie (sum of money). One player proposes a split; the other accepts or rejects.',
      yourGoal:
        'Proposers: claim as much as possible while making an offer your partner will accept. Responders: accept offers that are better than nothing, reject unfair splits.',
      howToPlay: [
        'The Proposer states how much of the pie to keep.',
        'The Responder sees the proposal and either Accepts or Rejects.',
        'Accept: Proposer earns the kept amount; Responder earns the remainder.',
        'Reject: Both players earn $0 for that round.',
        'The pie may shrink over rounds (discount factor), making delay costly.',
      ],
      tips: [
        'A shrinking pie means rejected offers destroy value — delay is costly for both sides.',
        'The responder\'s minimum acceptable offer should account for the shrinking pie.',
        'Think about what your partner will accept before making an offer.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Accept: Proposer profit = Keep amount; Responder profit = Pie - Keep',
        'Reject: Both earn 0',
        'Pie in round t: PieSize × (discountFactor)^(t-1)',
      ],
      equilibrium:
        'Rubinstein bargaining: with a discount factor δ, the subgame-perfect equilibrium gives the proposer 1/(1+δ) of the pie. With equal patience, the first mover gets slightly more than half.',
      keyParameters: [
        'pieSize — initial size of the pie to divide (default 10)',
        'discountFactor — pie shrinks by this factor each round (default 0.9)',
      ],
      teachingNotes: [
        'Compare to Ultimatum Game — similar structure but framing affects behavior.',
        'Track acceptance rates and proposal amounts across rounds.',
        'Discuss how patience (discount factor) affects bargaining power.',
      ],
    },
  },

  common_pool_resource: {
    studentInstructions: {
      premise:
        'You share a resource pool (e.g., a fishery) with other players. Each round, everyone simultaneously decides how much to extract. Over-extraction depletes the resource.',
      yourGoal:
        'Maximize your earnings by choosing how much to extract. More extraction earns you more, but if the group over-extracts, the resource is depleted and everyone suffers.',
      howToPlay: [
        'Each round, choose how many units to extract (0 to maximum).',
        'Your extraction earns you money directly.',
        'If total group extraction exceeds the pool size, all extractions are scaled down proportionally.',
        'Whatever remains in the pool generates a shared bonus distributed equally.',
        'Your profit = Your extraction earnings + Your share of the bonus.',
      ],
      tips: [
        'If everyone extracts the maximum, the pool is depleted and the shared bonus is $0.',
        'Restraint creates a larger total surplus through the shared bonus.',
        'This is the "Tragedy of the Commons" — individual incentives lead to overuse.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Extraction earnings = min(extraction, proportional share) × extractionValue',
        'Shared bonus = max(0, poolSize - totalExtraction) × regenerationRate / N',
        'Player profit = Extraction earnings + Shared bonus',
      ],
      equilibrium:
        'Nash equilibrium involves over-extraction relative to the social optimum. The socially optimal extraction balances marginal extraction value against the marginal loss of shared bonus.',
      keyParameters: [
        'poolSize — total units available in the resource pool (default 100)',
        'maxExtraction — maximum individual extraction per round (default 25)',
        'extractionValue — earnings per unit extracted (default 1)',
        'regenerationRate — rate at which remaining pool generates bonus (default 0.5)',
      ],
      teachingNotes: [
        'Classic illustration of the tragedy of the commons.',
        'Compare group extraction to the social optimum and Nash equilibrium.',
        'Discuss solutions: property rights, quotas, Pigouvian taxes, communication.',
      ],
    },
  },

  stag_hunt: {
    studentInstructions: {
      premise:
        'You are in a group where everyone must coordinate. Each player simultaneously chooses to Hunt Stag (requires everyone to cooperate) or Hunt Hare (safe but less rewarding).',
      yourGoal:
        'Earn the most by coordinating with your group. Hunting stag pays more but only if EVERYONE hunts stag.',
      howToPlay: [
        'Each round, choose: Hunt Stag or Hunt Hare.',
        'If ALL players choose Stag: everyone earns the Stag payoff (higher).',
        'If you choose Hare: you earn the Hare payoff regardless of others.',
        'If you choose Stag but anyone chooses Hare: you earn $0 (the stag escapes).',
      ],
      tips: [
        'Stag is better if you trust everyone to coordinate, but risky.',
        'Hare is the safe choice — guaranteed payoff no matter what.',
        'This game has two equilibria: all-Stag (better) and all-Hare (safer).',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'All choose Stag: each earns stagPayoff',
        'Choose Hare: earn harePayoff (regardless of others)',
        'Choose Stag when others choose Hare: earn 0',
      ],
      equilibrium:
        'Two pure-strategy Nash equilibria: all-Stag (payoff dominant) and all-Hare (risk dominant). Which one emerges depends on players\' trust and risk attitudes.',
      keyParameters: [
        'stagPayoff — payoff when all hunt stag (default 5)',
        'harePayoff — guaranteed payoff for hunting hare (default 3)',
      ],
      teachingNotes: [
        'Illustrates the difference between payoff dominance and risk dominance.',
        'Track coordination rates across rounds — does the group converge to one equilibrium?',
        'Discuss applications: technology adoption, bank runs, market entry.',
      ],
    },
  },

  dictator: {
    studentInstructions: {
      premise:
        'You are given an endowment and must decide how much to give to an anonymous recipient. The recipient has no say — you have all the power.',
      yourGoal:
        'Decide how to split the endowment. You keep whatever you don\'t give away.',
      howToPlay: [
        'You receive an endowment (e.g., $10).',
        'Choose how much to give to the recipient (0 to endowment).',
        'You keep the remainder: Your profit = Endowment - Amount Given.',
        'The recipient receives what you give (they cannot reject or respond).',
      ],
      tips: [
        'There is no strategic reason to give anything — this measures pure generosity.',
        'Think about what feels fair. What would you want to receive?',
        'Your choice is anonymous — no one will know what you decided.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Dictator profit = Endowment - Amount Given',
        'Recipient receives = Amount Given',
      ],
      equilibrium:
        'The Nash equilibrium (and subgame-perfect equilibrium) is to give $0. In experiments, the modal gift is $0 but the mean is typically 20-30% of the endowment.',
      keyParameters: [
        'endowment — amount the dictator receives to split (default 10)',
      ],
      teachingNotes: [
        'Measures pure altruism/fairness preferences without strategic considerations.',
        'Compare to Ultimatum Game — how much does the threat of rejection change behavior?',
        'Plot the distribution of giving: bimodal (0 and 50%) is typical.',
        'Discuss social preferences: altruism, inequality aversion, warm glow.',
      ],
    },
  },

  matching_pennies: {
    studentInstructions: {
      premise:
        'You are playing a zero-sum game. One player is the Matcher (wants choices to match) and the other is the Mismatcher (wants choices to differ). Both choose Heads or Tails simultaneously.',
      yourGoal:
        'Matchers: try to match your opponent\'s choice. Mismatchers: try to pick the opposite.',
      howToPlay: [
        'You are assigned a role: Matcher or Mismatcher.',
        'Each round, choose Heads or Tails.',
        'If choices match (both Heads or both Tails): Matcher wins, Mismatcher loses.',
        'If choices differ (one Heads, one Tails): Mismatcher wins, Matcher loses.',
        'Winners earn the win payoff; losers lose the same amount.',
      ],
      tips: [
        'There is no pure strategy that guarantees a win — your opponent can exploit patterns.',
        'The optimal strategy is to randomize 50/50 between Heads and Tails.',
        'Try not to be predictable — avoid patterns others can exploit.',
      ],
    },
    instructorNotes: {
      payoffFunctions: [
        'Match (both same): Matcher gets +winPayoff, Mismatcher gets -winPayoff',
        'Mismatch (different): Mismatcher gets +winPayoff, Matcher gets -winPayoff',
      ],
      equilibrium:
        'The unique Nash equilibrium is a mixed strategy: each player randomizes 50/50 between Heads and Tails. Expected payoff is 0 for both players.',
      keyParameters: [
        'winPayoff — amount won/lost per match (default 1)',
      ],
      teachingNotes: [
        'Test whether students randomize close to 50/50.',
        'Run a chi-squared test on observed frequencies vs. 50/50.',
        'Track serial correlation — are students truly random or do they alternate?',
        'Great for teaching mixed strategy equilibrium and hypothesis testing.',
      ],
    },
  },
};
