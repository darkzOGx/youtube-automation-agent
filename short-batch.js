require('dotenv').config();

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const sharp = require('sharp');
const { AIVideoGenerator } = require('./utils/ai-video-generator');
const { CredentialManager } = require('./utils/credential-manager');
const { runFFmpeg } = require('./utils/ffmpeg');
const {
  estimateNarrationDuration,
  isUsableAudioFile,
  renderShortVideo
} = require('./utils/short-video-renderer');
const {
  markPublicShortUploaded,
  reservePublicShort,
  releasePublicShort
} = require('./utils/youtube-rate-limit');
const { canUseWindowsSpeech, generateWindowsSpeech } = require('./utils/local-tts');
const {
  createCartoonIllustrations,
  getPalette
} = require('./utils/cartoon-illustrations');

const ROOT = __dirname;
const DEFAULT_BATCH_DIR = path.join(ROOT, 'data', 'short-batch-cartoon');
const LEGACY_BATCH_DIR = path.join(ROOT, 'data', 'short-batch');
const DEFAULT_FLOW_IMAGE_DIR = path.resolve(
  ROOT,
  process.env.FLOW_IMAGE_DIR || path.join('data', 'finance-sample', 'flow-images')
);
const MAX_COUNT = 20;
const VISUAL_BEATS_COUNT = 12;
const VISUAL_STYLE = 'local cartoon illustrations';
const RENDER_VERSION = 'cartoon-illustrations-v1';
const CATEGORY_ID = String(process.env.YOUTUBE_CATEGORY_ID || '27');
const EXPECTED_CHANNEL = process.env.CHANNEL_NAME || 'Nature Lover 2000';
const DEFAULT_UPLOAD_DELAY_MS = Number(process.env.SHORT_BATCH_UPLOAD_DELAY_MS || process.env.DEFAULT_DELAY_BETWEEN_POSTS || 15000);
const DISCLAIMER = 'This is general financial education, not personalized financial advice. Returns are not guaranteed. Fees, taxes, inflation, risk, and individual circumstances can affect outcomes.';

const TOPIC_DEFINITIONS = [
  {
    key: 'emergency-fund',
    title: 'Why an Emergency Fund Comes Before Investing',
    source: 'https://www.consumerfinance.gov/consumer-tools/savings-goal-calculator/',
    body: 'An emergency fund is cash set aside for unexpected costs such as a repair, medical bill, or loss of income. A practical starting point is a small target you can reach, followed by a review of essential monthly expenses. Keeping this money accessible can reduce the need to use expensive debt when life changes. The right amount depends on income stability, household needs, insurance, and available support. A savings account is different from a long-term investment because the priority here is access and stability, not chasing market growth.'
  },
  {
    key: 'compound-interest',
    title: 'Compound Interest: Time Changes the Math',
    source: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator',
    body: 'Compound interest means that interest or investment growth can be added to a balance, allowing later growth to apply to the larger balance. A hypothetical example can show why time and regular contributions matter. But an assumed rate is only an assumption. Investment values can fall, contributions can change, and fees and taxes can reduce results. The useful lesson is to test several assumptions and understand the math rather than treating an illustration as a forecast.'
  },
  {
    key: 'apr-versus-apy',
    title: 'APR and APY Are Not the Same Number',
    source: 'https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-an-apr-and-an-apy-en-126/',
    body: 'APR and APY describe different parts of borrowing and saving costs. Annual percentage rate, or APR, is commonly used to compare borrowing costs and may include certain fees. Annual percentage yield, or APY, reflects the effect of compounding on a deposit account. When comparing products, check the account terms, compounding schedule, fees, and whether the rate is fixed or variable. A larger-looking number is not automatically the better deal without knowing what it measures.'
  },
  {
    key: 'diversification',
    title: 'Diversification Reduces Single-Asset Risk',
    source: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/diversification',
    body: 'Diversification means spreading money across different investments instead of relying on one company, sector, or asset. It can reduce the effect of one holding performing badly, although it cannot remove market risk or guarantee a profit. Diversification should match the time horizon and risk tolerance of the goal. A broad fund may hold many securities, but investors should still review what it owns, its fees, and how closely it fits the intended allocation.'
  },
  {
    key: 'dollar-cost-averaging',
    title: 'What Dollar-Cost Averaging Actually Does',
    source: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging',
    body: 'Dollar-cost averaging is investing equal amounts at regular intervals, regardless of market price. That approach buys more shares when prices are lower and fewer when prices are higher. It can make a routine easier to follow and reduce the pressure to choose one entry date. It does not guarantee a profit, prevent losses, or prove better than investing a lump sum when cash is already available. The method should be considered alongside fees, taxes, and the goal timeline.'
  },
  {
    key: 'credit-utilization',
    title: 'Credit Utilization Is One Part of Credit Health',
    source: 'https://www.consumerfinance.gov/ask-cfpb/what-is-credit-utilization-and-how-does-it-affect-my-credit-score-en-413/',
    body: 'Credit utilization compares reported revolving balances with available credit limits. Lower utilization is often viewed favorably by scoring models, but there is no single magic percentage that guarantees a particular score. Payment history, account age, new applications, and credit mix can also matter. Paying a balance in full can avoid interest, but the reported balance depends on issuer timing. Check statements and credit reports, and do not borrow money simply to manipulate a score.'
  },
  {
    key: 'payment-history',
    title: 'Why On-Time Payments Matter',
    source: 'https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/',
    body: 'Payment history is an important part of many credit-scoring systems. Missing a required payment can lead to fees, interest, account actions, and possible credit-reporting consequences. A simple system can help: list due dates, use reminders, and choose autopay for at least a manageable minimum when appropriate. Autopay is not a substitute for checking the account balance and statement. Different lenders and scoring models use different information, so a single action cannot guarantee a score change.'
  },
  {
    key: 'inflation',
    title: 'Inflation Changes Purchasing Power',
    source: 'https://www.bls.gov/cpi/',
    body: 'Inflation is a general increase in prices over time, which means a fixed amount of money may buy fewer goods and services later. The Consumer Price Index is one measure of average price changes, not a personal forecast for every household. When planning a goal, compare expected costs, income, savings, and the time horizon. Cash can offer stability and access, while investments introduce risk. The right balance depends on when the money is needed and how much loss can be tolerated.'
  },
  {
    key: 'investment-fees',
    title: 'Small Investment Fees Can Compound Too',
    source: 'https://www.investor.gov/introduction-investing/getting-started/fees-and-expenses',
    body: 'Investment fees can include expense ratios, transaction costs, account fees, or advisory charges. A fee that looks small can reduce the balance available to grow over a long period. Compare the total cost, services, investment approach, and tax treatment rather than looking at one percentage in isolation. Lower cost does not automatically mean better for every investor, but understanding the fee lets you compare more honestly. Ask for a clear explanation of how and when each charge is applied.'
  },
  {
    key: 'employer-match',
    title: 'How to Understand an Employer Match',
    source: 'https://www.dol.gov/general/topic/retirement/401k',
    body: 'Some workplace retirement plans contribute additional money when an employee contributes, subject to plan rules. Read the plan document for the match formula, contribution limits, vesting schedule, eligible pay, and investment choices. A match can be an important benefit, but it is not a reason to ignore high-interest debt or an emergency reserve. Contributions are invested according to the selected options and can lose value. Review the rules with the plan administrator before making a decision.'
  },
  {
    key: 'roth-traditional',
    title: 'Roth and Traditional Retirement Accounts',
    source: 'https://www.irs.gov/retirement-plans/roth-comparison-chart',
    body: 'Traditional and Roth retirement accounts generally differ in when taxes are applied. Traditional contributions may receive tax treatment now and withdrawals may be taxable later, subject to rules. Roth contributions are generally made with after-tax money and qualified withdrawals may be tax-free. Eligibility, limits, deductions, employer plans, and future tax circumstances matter. The label alone does not identify the best choice. Check current IRS rules and consider professional guidance for a personal decision.'
  },
  {
    key: 'bond-prices',
    title: 'Why Bond Prices Can Move When Rates Change',
    source: 'https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products',
    body: 'A bond is a debt investment with terms that can include interest payments and a maturity date. When market interest rates change, the price of an existing bond can move because its fixed payments look more or less attractive compared with new bonds. A bond fund has its own price and interest-rate exposure, and it does not have the same maturity promise as an individual bond. Credit risk, inflation, liquidity, and fees also matter. Bonds are not automatically risk-free.'
  },
  {
    key: 'saving-versus-investing',
    title: 'Saving and Investing Serve Different Timelines',
    source: 'https://www.investor.gov/introduction-investing/investing-basics',
    body: 'Saving usually emphasizes access and preserving money for nearer-term needs. Investing generally accepts more uncertainty in pursuit of long-term growth. Money needed soon may not have enough time to recover from a market decline, while money for a distant goal may face purchasing-power risk if it never grows. Separate goals by timeline, build a cash reserve, and understand the possible loss before choosing an account or investment. There is no universal allocation that fits every household.'
  },
  {
    key: 'needs-wants-budget',
    title: 'A Budget Turns Spending Into a Plan',
    source: 'https://www.consumerfinance.gov/consumer-tools/budgeting/',
    body: 'A budget is a plan for expected income and spending, not a test of willpower. Start with take-home income, fixed bills, variable essentials, debt payments, savings goals, and flexible spending. Review several months of actual transactions so irregular costs do not disappear from the plan. A useful budget leaves room for adjustments and realistic priorities. Cutting every enjoyable purchase may not be sustainable. The goal is awareness and control, not a perfect number that never changes.'
  },
  {
    key: 'sinking-funds',
    title: 'Sinking Funds Make Irregular Bills Predictable',
    source: 'https://www.consumerfinance.gov/consumer-tools/saving-goals/',
    body: 'A sinking fund sets aside money over time for a known future expense such as insurance, gifts, tuition, or car maintenance. Estimate the bill, divide it across the months before it is due, and keep the money separate enough to see its purpose. Estimates can be wrong, so review the balance and update the monthly amount. A sinking fund is not an emergency fund and does not make an unaffordable expense affordable by itself. It is a planning tool for costs you can reasonably anticipate.'
  },
  {
    key: 'debt-payoff-methods',
    title: 'Debt Avalanche and Debt Snowball',
    source: 'https://www.consumerfinance.gov/ask-cfpb/what-is-the-debt-avalanche-method-en-1057/',
    body: 'The debt avalanche method sends extra money toward the highest interest rate while paying required minimums elsewhere. The debt snowball method targets the smallest balance first to create quick milestones. Both methods can work if minimum payments remain current and the plan is sustainable. The avalanche may reduce interest mathematically, while the snowball can provide motivation. Compare rates, fees, cash flow, and behavior rather than treating one method as a guarantee of success.'
  },
  {
    key: 'simple-versus-compound',
    title: 'Simple Interest Versus Compound Interest',
    source: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator',
    body: 'Simple interest is calculated on the original principal under the stated terms. Compound interest calculates later interest on a balance that can include previously credited interest. Real products can use daily, monthly, or other schedules, and fees or withdrawals change the math. Before comparing offers, check the annual rate, compounding frequency, balance rules, and penalties. A calculator can illustrate the difference, but the result is only as reliable as the assumptions entered.'
  },
  {
    key: 'net-worth',
    title: 'Net Worth Is a Snapshot, Not a Score',
    source: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/financial-well-being/',
    body: 'Net worth is the value of what you own minus what you owe at a point in time. Listing cash, investments, property, loans, and credit balances can show the direction of a plan more clearly than income alone. Values can change, estimates can be imperfect, and a single month is not a verdict on financial health. Track it periodically, use consistent definitions, and pair the snapshot with cash flow, goals, insurance, and the ability to handle emergencies.'
  },
  {
    key: 'tax-withholding',
    title: 'Tax Withholding Is Not Your Final Tax Bill',
    source: 'https://www.irs.gov/individuals/understanding-your-irs-notice-or-letter',
    body: 'Tax withholding is money sent from pay or certain payments toward an eventual tax obligation. The final amount depends on income, deductions, credits, filing status, and current tax rules. A refund may mean more was withheld than needed, while a balance due can mean withholding was too low; neither result alone measures financial success. Review pay stubs and the official withholding estimator when circumstances change. Keep records and use a qualified tax professional for personal questions.'
  },
  {
    key: 'financial-scams',
    title: 'Three Checks Before Trusting a Money Offer',
    source: 'https://www.consumerfinance.gov/consumer-tools/fraud/',
    body: 'Be cautious when a money offer demands urgency, secrecy, upfront payment, or promises unusually easy profits. Verify the person and company independently, read the terms, and do not share passwords or one-time security codes. Search for official contact details instead of using a link in an unexpected message. A polished website or testimonial is not proof. Pause when pressure rises and report suspected fraud through the appropriate official channel. Protecting money often starts with slowing down.'
  }
];

const FINANCE_TOPICS = TOPIC_DEFINITIONS.map((topic, index) => ({
  ...topic,
  index: index + 1,
  isShort: true,
  contentType: 'short',
  aspectRatio: '9:16',
  script: `${topic.body}\n\n${DISCLAIMER}`,
  tags: ['Shorts', 'personal finance', 'financial literacy', 'money basics', topic.key]
}));

const VISUAL_PLANS = {
  'emergency-fund': [
    { title: 'Repair bill', detail: 'A broken appliance can arrive without warning', kind: 'receipt' },
    { title: 'Medical expense', detail: 'An urgent bill can hit the monthly plan', kind: 'receipt' },
    { title: 'Income gap', detail: 'A pause in income makes accessible cash valuable', kind: 'clock' },
    { title: 'First target', detail: 'Choose a savings milestone you can reach', kind: 'target' },
    { title: 'Cash cushion', detail: 'Keep reserve money liquid and separate', kind: 'jar' },
    { title: 'Essential costs', detail: 'List housing food utilities and transport', kind: 'house' },
    { title: 'Monthly deposits', detail: 'Build the target with repeat contributions', kind: 'calendar' },
    { title: 'Debt detour', detail: 'Cash can reduce reliance on expensive debt', kind: 'credit-card' },
    { title: 'Coverage check', detail: 'Insurance and support change the target', kind: 'shield' },
    { title: 'Refill the reserve', detail: 'Review the balance after a withdrawal', kind: 'chart' },
    { title: 'Access test', detail: 'Know where the reserve is held', kind: 'lock' },
    { title: 'Steady foundation', detail: 'Start with stability before chasing growth', kind: 'cash' }
  ],
  'compound-interest': [
    { title: 'Starting balance', detail: 'Growth begins with the amount already saved', kind: 'cash' },
    { title: 'Interest is added', detail: 'Credited interest can join the balance', kind: 'coins' },
    { title: 'Growth on growth', detail: 'Later growth can apply to earlier growth', kind: 'chart' },
    { title: 'Time does work', detail: 'A longer horizon changes the math', kind: 'clock' },
    { title: 'Regular contributions', detail: 'New deposits can add another growth base', kind: 'calendar' },
    { title: 'Reinvested earnings', detail: 'Leaving earnings invested changes the curve', kind: 'jar' },
    { title: 'Assumed rate', detail: 'A hypothetical rate is not a promise', kind: 'target' },
    { title: 'Slow beginning', detail: 'Early progress can look modest', kind: 'ladder' },
    { title: 'Later acceleration', detail: 'The balance can grow faster on a larger base', kind: 'chart' },
    { title: 'Fees and taxes', detail: 'Costs can reduce the amount left to grow', kind: 'receipt' },
    { title: 'Down years', detail: 'Investment values can fall along the way', kind: 'warning' },
    { title: 'Test scenarios', detail: 'Compare several assumptions before deciding', kind: 'scale' }
  ],
  'apr-versus-apy': [
    { title: 'Borrowing cost', detail: 'APR commonly helps compare borrowing costs', kind: 'credit-card' },
    { title: 'Deposit yield', detail: 'APY describes the effect of compounding', kind: 'jar' },
    { title: 'APR label', detail: 'Check what fees the stated rate includes', kind: 'receipt' },
    { title: 'APY compounds', detail: 'The yield reflects a compounding schedule', kind: 'chart' },
    { title: 'Terms matter', detail: 'A rate is only one part of the product', kind: 'document' },
    { title: 'Schedule check', detail: 'Daily monthly and other schedules differ', kind: 'calendar' },
    { title: 'Fixed or variable', detail: 'A rate can stay put or change over time', kind: 'scale' },
    { title: 'Compare like with like', detail: 'Use the same measure for a fair comparison', kind: 'scale' },
    { title: 'Bigger is not always better', detail: 'A larger number needs context', kind: 'warning' },
    { title: 'Account access', detail: 'Withdrawal rules can affect the real value', kind: 'lock' },
    { title: 'Read the terms', detail: 'Look for fees limits and conditions', kind: 'receipt' },
    { title: 'Choose the measure', detail: 'Match APR or APY to the decision', kind: 'target' }
  ],
  diversification: [
    { title: 'Single holding', detail: 'One company can dominate the outcome', kind: 'warning' },
    { title: 'Asset buckets', detail: 'Spread exposure across different assets', kind: 'bucket' },
    { title: 'Stock slice', detail: 'Company ownership brings market movement', kind: 'chart' },
    { title: 'Bond slice', detail: 'Debt investments have their own risks', kind: 'document' },
    { title: 'Sector spread', detail: 'Different industries may behave differently', kind: 'scale' },
    { title: 'Broad fund', detail: 'A fund may hold many securities', kind: 'jar' },
    { title: 'Allocation target', detail: 'Choose a mix for the goal and horizon', kind: 'target' },
    { title: 'Market drop', detail: 'Diversification cannot remove market losses', kind: 'chart' },
    { title: 'Company risk', detail: 'One weak holding has less control in a mix', kind: 'shield' },
    { title: 'Time horizon', detail: 'The right mix depends on when money is needed', kind: 'clock' },
    { title: 'Review holdings', detail: 'Check what a fund actually owns', kind: 'document' },
    { title: 'Risk remains', detail: 'Spreading money never guarantees a profit', kind: 'warning' }
  ],
  'dollar-cost-averaging': [
    { title: 'Scheduled deposit', detail: 'Invest a planned amount at regular intervals', kind: 'calendar' },
    { title: 'Equal amount', detail: 'The contribution stays consistent by design', kind: 'cash' },
    { title: 'High price', detail: 'The same dollars buy fewer shares', kind: 'chart' },
    { title: 'Low price', detail: 'The same dollars buy more shares', kind: 'chart' },
    { title: 'More shares', detail: 'Lower prices can increase the share count', kind: 'coins' },
    { title: 'Fewer shares', detail: 'Higher prices can reduce the share count', kind: 'coins' },
    { title: 'Routine transfer', detail: 'A system can remove one timing decision', kind: 'clock' },
    { title: 'One-date pressure', detail: 'The method avoids choosing one entry day', kind: 'warning' },
    { title: 'Losses still happen', detail: 'Regular investing does not prevent losses', kind: 'warning' },
    { title: 'Fees and taxes', detail: 'Costs still affect each contribution', kind: 'receipt' },
    { title: 'Goal timeline', detail: 'Match the routine to when money is needed', kind: 'target' },
    { title: 'Check the method', detail: 'Compare it with a lump sum when relevant', kind: 'scale' }
  ],
  'credit-utilization': [
    { title: 'Credit limit', detail: 'Available revolving credit sets the ceiling', kind: 'credit-card' },
    { title: 'Reported balance', detail: 'The issuer may report a balance snapshot', kind: 'receipt' },
    { title: 'Utilization ratio', detail: 'Balance divided by limit creates the ratio', kind: 'scale' },
    { title: 'Lower ratio', detail: 'A smaller reported balance is often viewed favorably', kind: 'chart' },
    { title: 'Statement date', detail: 'Timing affects which balance gets reported', kind: 'calendar' },
    { title: 'Available room', detail: 'Unused limit is not a reason to borrow', kind: 'jar' },
    { title: 'No magic percentage', detail: 'No single number guarantees a score', kind: 'warning' },
    { title: 'Pay in full', detail: 'Full payment can help avoid interest', kind: 'shield' },
    { title: 'Interest cost', detail: 'Do not carry debt just to shape a score', kind: 'cash' },
    { title: 'Account age', detail: 'Credit health includes history over time', kind: 'clock' },
    { title: 'New applications', detail: 'Recent applications can also matter', kind: 'document' },
    { title: 'Review the report', detail: 'Check statements and reports for errors', kind: 'target' }
  ],
  'payment-history': [
    { title: 'Due date', detail: 'Put every required payment on a calendar', kind: 'calendar' },
    { title: 'Required minimum', detail: 'Keep the minimum current when appropriate', kind: 'receipt' },
    { title: 'Reminder', detail: 'A simple alert can protect the routine', kind: 'clock' },
    { title: 'Autopay setting', detail: 'Automate a manageable payment if useful', kind: 'credit-card' },
    { title: 'Account balance', detail: 'Autopay is not a substitute for checking cash', kind: 'jar' },
    { title: 'Missed payment', detail: 'Late action can create fees and consequences', kind: 'warning' },
    { title: 'Fees and interest', detail: 'A missed date can make debt more expensive', kind: 'chart' },
    { title: 'Credit reporting', detail: 'Payment data may reach a credit report', kind: 'document' },
    { title: 'Scoring models', detail: 'Different models use different information', kind: 'scale' },
    { title: 'Check the statement', detail: 'Confirm the payment posted correctly', kind: 'receipt' },
    { title: 'Keep a buffer', detail: 'Leave room for timing and account changes', kind: 'shield' },
    { title: 'Repeat on time', detail: 'A reliable system beats a last-minute scramble', kind: 'target' }
  ],
  inflation: [
    { title: 'Price tag', detail: 'The same item can cost more later', kind: 'receipt' },
    { title: 'Purchasing power', detail: 'A fixed dollar amount may buy less', kind: 'cash' },
    { title: 'Grocery basket', detail: 'Household price changes are not identical', kind: 'bucket' },
    { title: 'CPI snapshot', detail: 'An index measures average price movement', kind: 'chart' },
    { title: 'Future cost', detail: 'Time changes what a goal may require', kind: 'clock' },
    { title: 'Income comparison', detail: 'Compare costs with income and savings', kind: 'scale' },
    { title: 'Cash stability', detail: 'Cash can offer access for near-term needs', kind: 'jar' },
    { title: 'Investment uncertainty', detail: 'Growth options also introduce risk', kind: 'warning' },
    { title: 'Goal timeline', detail: 'The deadline helps shape the plan', kind: 'calendar' },
    { title: 'Household differences', detail: 'Average inflation is not a personal forecast', kind: 'people' },
    { title: 'Scenario check', detail: 'Test more than one cost assumption', kind: 'chart' },
    { title: 'Balance the plan', detail: 'Access growth and risk must fit the goal', kind: 'target' }
  ],
  'investment-fees': [
    { title: 'Expense ratio', detail: 'A fund cost reduces the balance over time', kind: 'receipt' },
    { title: 'Trading charge', detail: 'Transaction costs can reduce each move', kind: 'credit-card' },
    { title: 'Account fee', detail: 'Some accounts charge for access or service', kind: 'document' },
    { title: 'Advice charge', detail: 'Compare the service with the total cost', kind: 'people' },
    { title: 'Small percentage', detail: 'A small rate can matter over a long horizon', kind: 'scale' },
    { title: 'Long horizon', detail: 'Time gives costs more chances to compound', kind: 'clock' },
    { title: 'Less left to grow', detail: 'Every charge leaves less money invested', kind: 'chart' },
    { title: 'Compare the service', detail: 'Lower cost is not the only question', kind: 'people' },
    { title: 'Tax treatment', detail: 'Taxes can change the cost comparison', kind: 'tax' },
    { title: 'Charge timing', detail: 'Know when and how each fee is applied', kind: 'calendar' },
    { title: 'Ask what is included', detail: 'Request a clear explanation of charges', kind: 'warning' },
    { title: 'Total cost', detail: 'Compare the whole price instead of one number', kind: 'target' }
  ],
  'employer-match': [
    { title: 'Paycheck contribution', detail: 'An employee contribution starts the process', kind: 'cash' },
    { title: 'Employee deposit', detail: 'Read how much the plan accepts', kind: 'jar' },
    { title: 'Employer add-on', detail: 'The plan may contribute extra money', kind: 'people' },
    { title: 'Match formula', detail: 'The formula determines how the benefit works', kind: 'scale' },
    { title: 'Contribution limit', detail: 'Annual limits can restrict the amount', kind: 'document' },
    { title: 'Vesting schedule', detail: 'Some employer money takes time to vest', kind: 'calendar' },
    { title: 'Eligible pay', detail: 'The plan rules define which pay counts', kind: 'receipt' },
    { title: 'Investment menu', detail: 'Contributions use the options you select', kind: 'chart' },
    { title: 'Market value', detail: 'Invested balances can lose value', kind: 'warning' },
    { title: 'Emergency reserve', detail: 'A match is not a substitute for cash reserves', kind: 'shield' },
    { title: 'High-interest debt', detail: 'Consider expensive debt in the full plan', kind: 'credit-card' },
    { title: 'Read the plan', detail: 'Confirm rules with the plan administrator', kind: 'target' }
  ],
  'roth-traditional': [
    { title: 'Traditional account', detail: 'Tax treatment may happen partly up front', kind: 'document' },
    { title: 'Roth account', detail: 'Contributions are generally after tax', kind: 'jar' },
    { title: 'Tax treatment now', detail: 'Current deductions depend on the rules', kind: 'tax' },
    { title: 'Tax treatment later', detail: 'Future withdrawals have conditions', kind: 'calendar' },
    { title: 'Qualified withdrawal', detail: 'Account rules define when benefits apply', kind: 'shield' },
    { title: 'Eligibility limits', detail: 'Income and contribution limits can matter', kind: 'scale' },
    { title: 'Employer plan', detail: 'Workplace options add another layer of rules', kind: 'people' },
    { title: 'Deduction question', detail: 'A label alone does not answer tax treatment', kind: 'receipt' },
    { title: 'Future rules uncertain', detail: 'Future tax circumstances are not known', kind: 'warning' },
    { title: 'Investment options', detail: 'The account still holds chosen investments', kind: 'chart' },
    { title: 'Current rules', detail: 'Check the latest official guidance', kind: 'document' },
    { title: 'Personal fit', detail: 'The better choice depends on circumstances', kind: 'target' }
  ],
  'bond-prices': [
    { title: 'Bond contract', detail: 'A bond has terms for payments and maturity', kind: 'document' },
    { title: 'Fixed payment', detail: 'The stated payment can stay fixed', kind: 'cash' },
    { title: 'Rates rise', detail: 'New bonds can offer more attractive rates', kind: 'chart' },
    { title: 'Existing price falls', detail: 'Older fixed payments may look less attractive', kind: 'warning' },
    { title: 'New bond comparison', detail: 'Price and yield move together in the market', kind: 'scale' },
    { title: 'Rates move down', detail: 'Existing payments can look more attractive', kind: 'chart' },
    { title: 'Maturity date', detail: 'An individual bond has a stated end date', kind: 'calendar' },
    { title: 'Bond fund', detail: 'A fund has its own price and rate exposure', kind: 'bucket' },
    { title: 'Different maturity', detail: 'A fund does not make one maturity promise', kind: 'clock' },
    { title: 'Credit risk', detail: 'The issuer may not meet every obligation', kind: 'shield' },
    { title: 'Inflation risk', detail: 'Future payments may buy less than expected', kind: 'receipt' },
    { title: 'Fees and liquidity', detail: 'Costs and trading access also matter', kind: 'target' }
  ],
  'saving-versus-investing': [
    { title: 'Near-term need', detail: 'Sooner goals usually prioritize access', kind: 'calendar' },
    { title: 'Cash reserve', detail: 'Savings can preserve money for planned needs', kind: 'jar' },
    { title: 'Easy access', detail: 'A reserve should be available when needed', kind: 'lock' },
    { title: 'Long horizon', detail: 'Distant goals may have time for uncertainty', kind: 'clock' },
    { title: 'Growth possibility', detail: 'Investing accepts risk for possible growth', kind: 'chart' },
    { title: 'Market decline', detail: 'Investments can be worth less at the wrong time', kind: 'warning' },
    { title: 'Recovery time', detail: 'A longer horizon may allow more recovery time', kind: 'ladder' },
    { title: 'Purchasing power', detail: 'Cash that never grows can lose buying power', kind: 'cash' },
    { title: 'Goal buckets', detail: 'Separate money by purpose and deadline', kind: 'bucket' },
    { title: 'Risk tolerance', detail: 'The possible loss must be acceptable', kind: 'scale' },
    { title: 'Separate accounts', detail: 'Keep near and long-term jobs visible', kind: 'house' },
    { title: 'Match the timeline', detail: 'Choose the tool after choosing the date', kind: 'target' }
  ],
  'needs-wants-budget': [
    { title: 'Take-home income', detail: 'Start with money that actually arrives', kind: 'cash' },
    { title: 'Fixed bills', detail: 'Housing and recurring bills anchor the plan', kind: 'house' },
    { title: 'Variable essentials', detail: 'Food and transport can change month to month', kind: 'receipt' },
    { title: 'Debt payment', detail: 'Required debt payments belong in the plan', kind: 'credit-card' },
    { title: 'Savings goal', detail: 'Give saving a visible job and amount', kind: 'jar' },
    { title: 'Flexible spending', detail: 'A useful budget leaves room for real life', kind: 'people' },
    { title: 'Review transactions', detail: 'Actual history reveals what estimates miss', kind: 'document' },
    { title: 'Irregular costs', detail: 'Annual bills should not disappear from view', kind: 'calendar' },
    { title: 'Needs versus wants', detail: 'Categories make tradeoffs easier to see', kind: 'scale' },
    { title: 'Adjust the plan', detail: 'A budget should change when facts change', kind: 'chart' },
    { title: 'Realistic priorities', detail: 'Sustainable choices beat perfect guesses', kind: 'target' },
    { title: 'Sustainable routine', detail: 'Review and revise instead of starting over', kind: 'clock' }
  ],
  'sinking-funds': [
    { title: 'Known future bill', detail: 'Plan ahead for a cost you can anticipate', kind: 'receipt' },
    { title: 'Insurance due', detail: 'A predictable premium can use a dedicated fund', kind: 'shield' },
    { title: 'Gifts and events', detail: 'Seasonal spending is easier when expected', kind: 'people' },
    { title: 'Tuition date', detail: 'A deadline tells you how much time remains', kind: 'document' },
    { title: 'Car maintenance', detail: 'Planned upkeep is not the same as a surprise', kind: 'house' },
    { title: 'Estimate total', detail: 'Start with a reasonable cost estimate', kind: 'scale' },
    { title: 'Divide by months', detail: 'Spread the target across the months left', kind: 'calendar' },
    { title: 'Separate bucket', detail: 'A visible purpose keeps the money organized', kind: 'bucket' },
    { title: 'Balance visible', detail: 'Track progress toward the upcoming bill', kind: 'chart' },
    { title: 'Estimate can change', detail: 'Update the amount when the facts change', kind: 'warning' },
    { title: 'Not an emergency', detail: 'A planned fund serves a different job', kind: 'jar' },
    { title: 'Monthly review', detail: 'Check the balance and adjust the deposit', kind: 'clock' }
  ],
  'debt-payoff-methods': [
    { title: 'List every balance', detail: 'Write down rates balances and minimums', kind: 'document' },
    { title: 'Minimum payments', detail: 'Keep required payments current first', kind: 'receipt' },
    { title: 'Highest rate', detail: 'The avalanche targets the costliest debt', kind: 'chart' },
    { title: 'Avalanche path', detail: 'Extra cash moves toward the highest rate', kind: 'ladder' },
    { title: 'Smallest balance', detail: 'The snowball starts with a quick milestone', kind: 'target' },
    { title: 'Snowball milestone', detail: 'Visible progress can help motivation', kind: 'coins' },
    { title: 'Extra cash', detail: 'Direct a sustainable amount beyond minimums', kind: 'cash' },
    { title: 'Keep current', detail: 'Neither method works without required payments', kind: 'calendar' },
    { title: 'Interest comparison', detail: 'Compare the mathematical cost of each route', kind: 'scale' },
    { title: 'Fees and cash flow', detail: 'A plan must fit the money available each month', kind: 'warning' },
    { title: 'Motivation matters', detail: 'Behavior can affect which method lasts', kind: 'people' },
    { title: 'Sustainable route', detail: 'Choose a plan you can keep following', kind: 'shield' }
  ],
  'simple-versus-compound': [
    { title: 'Original principal', detail: 'Simple interest starts from the original amount', kind: 'cash' },
    { title: 'Simple formula', detail: 'The stated terms determine the calculation', kind: 'document' },
    { title: 'Interest schedule', detail: 'Check when interest is credited', kind: 'calendar' },
    { title: 'Compound balance', detail: 'Later interest can use a larger balance', kind: 'chart' },
    { title: 'Interest on interest', detail: 'Earlier credits can join the base', kind: 'coins' },
    { title: 'Daily crediting', detail: 'Some products calculate on a daily schedule', kind: 'clock' },
    { title: 'Monthly crediting', detail: 'Other products use a different schedule', kind: 'calendar' },
    { title: 'Withdrawals change math', detail: 'Removing money changes future growth', kind: 'warning' },
    { title: 'Fees reduce growth', detail: 'Charges can change the final balance', kind: 'receipt' },
    { title: 'Penalties matter', detail: 'Check the cost of changing the plan', kind: 'credit-card' },
    { title: 'Compare assumptions', detail: 'Use the same inputs for a fair example', kind: 'scale' },
    { title: 'Calculator result', detail: 'An illustration is only as good as its inputs', kind: 'target' }
  ],
  'net-worth': [
    { title: 'List your assets', detail: 'Start with what you own at a point in time', kind: 'house' },
    { title: 'Cash on hand', detail: 'Include accessible balances consistently', kind: 'cash' },
    { title: 'Investments', detail: 'Market values can change between snapshots', kind: 'chart' },
    { title: 'Property estimate', detail: 'Use a consistent method for property values', kind: 'house' },
    { title: 'Loan balance', detail: 'Debt belongs on the other side of the list', kind: 'credit-card' },
    { title: 'Credit balance', detail: 'Include revolving debt you still owe', kind: 'receipt' },
    { title: 'Subtract what is owed', detail: 'Net worth is assets minus liabilities', kind: 'scale' },
    { title: 'Snapshot date', detail: 'The result describes one moment in time', kind: 'clock' },
    { title: 'Values can move', detail: 'A single month is not a verdict', kind: 'warning' },
    { title: 'Consistent definitions', detail: 'Use the same categories each time', kind: 'document' },
    { title: 'Pair with cash flow', detail: 'The snapshot needs context from daily money', kind: 'people' },
    { title: 'Track direction', detail: 'Periodic snapshots can show a trend', kind: 'target' }
  ],
  'tax-withholding': [
    { title: 'Paycheck', detail: 'Withholding is taken from pay or some payments', kind: 'cash' },
    { title: 'Withholding line', detail: 'The amount sent in is not the final bill', kind: 'tax' },
    { title: 'Estimated obligation', detail: 'The eventual amount depends on current rules', kind: 'document' },
    { title: 'Filing status', detail: 'Household and filing details affect the result', kind: 'people' },
    { title: 'Deductions', detail: 'Eligible deductions can change taxable income', kind: 'receipt' },
    { title: 'Credits', detail: 'Credits can affect the final calculation', kind: 'target' },
    { title: 'Refund', detail: 'A refund can mean more was withheld than needed', kind: 'jar' },
    { title: 'Balance due', detail: 'A payment can mean withholding was too low', kind: 'warning' },
    { title: 'Pay stub review', detail: 'Check the line when circumstances change', kind: 'calendar' },
    { title: 'Life changes', detail: 'Income and household changes can alter withholding', kind: 'clock' },
    { title: 'Official estimator', detail: 'Use the current official calculation tool', kind: 'scale' },
    { title: 'Keep records', detail: 'Save documents and seek qualified guidance', kind: 'lock' }
  ],
  'financial-scams': [
    { title: 'Urgency pressure', detail: 'A rush can make careful checking harder', kind: 'warning' },
    { title: 'Secret request', detail: 'Secrecy is a reason to pause and verify', kind: 'lock' },
    { title: 'Upfront payment', detail: 'Do not pay before independently checking the offer', kind: 'credit-card' },
    { title: 'Easy profit promise', detail: 'Unusually easy returns deserve skepticism', kind: 'chart' },
    { title: 'Check the identity', detail: 'Confirm who is contacting you', kind: 'people' },
    { title: 'Verify independently', detail: 'Use official contact details you find yourself', kind: 'document' },
    { title: 'Official contact', detail: 'Do not trust a link in an unexpected message', kind: 'receipt' },
    { title: 'Terms before trust', detail: 'Read the offer instead of relying on polish', kind: 'target' },
    { title: 'Password guard', detail: 'Never share passwords or security codes', kind: 'shield' },
    { title: 'One-time code', detail: 'A real company should not need your private code', kind: 'lock' },
    { title: 'Report suspected fraud', detail: 'Use the appropriate official reporting channel', kind: 'warning' },
    { title: 'Slow down', detail: 'Protecting money often starts with a pause', kind: 'clock' }
  ]
};

function parseArgs(argv) {
  const options = {
    count: 20,
    upload: false,
    publicUpload: false,
    preview: true,
    allowSilent: false,
    uploadCaptions: false,
    skipThumbnails: false,
    outputDir: DEFAULT_BATCH_DIR,
    flowImageDir: DEFAULT_FLOW_IMAGE_DIR,
    help: false
  };
  const valueFlags = new Set(['--count', '--output-dir', '--flow-image-dir']);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equalsIndex = argument.indexOf('=');
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    let value = equalsIndex === -1 ? null : argument.slice(equalsIndex + 1);

    if (flag === '--help' || flag === '-h') {
      options.help = true;
    } else if (flag === '--upload') {
      options.upload = true;
      options.preview = false;
    } else if (flag === '--public') {
      options.publicUpload = true;
      options.preview = false;
    } else if (flag === '--preview') {
      options.preview = true;
    } else if (flag === '--allow-silent') {
      options.allowSilent = true;
    } else if (flag === '--youtube-captions') {
      options.uploadCaptions = true;
    } else if (flag === '--skip-thumbnails') {
      options.skipThumbnails = true;
    } else if (valueFlags.has(flag)) {
      if (value === null) {
        value = argv[index + 1];
        index += 1;
      }
      if (!value || value.startsWith('--')) throw new Error(`A value is required for ${flag}`);
      if (flag === '--count') options.count = Number(value);
      if (flag === '--output-dir') options.outputDir = value;
      if (flag === '--flow-image-dir') options.flowImageDir = value;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function validateOptions(options) {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > MAX_COUNT) {
    throw new Error('--count must be an integer from 1 to 20');
  }
  if (options.publicUpload && !options.upload) {
    throw new Error('--public requires --upload; public uploads are never implicit');
  }
  if (options.preview && options.upload) {
    throw new Error('--preview cannot be combined with --upload');
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run shorts:batch                 Generate 20 local finance Shorts
  npm run shorts:batch -- --count 5    Generate a smaller local preview batch

Options:
  --count <1..20>       Number of predefined topics (default: 20)
  --preview             Generate local files only (default behavior)
  --upload              Upload generated files; private unless --public is set
  --public              Required with --upload for public Shorts
  --allow-silent        Permit an intentional silent preview when TTS fails
  --youtube-captions    Also upload SRT tracks (burned captions are always included)
  --skip-thumbnails     Continue uploads when YouTube thumbnail uploads are blocked
  --flow-image-dir <p>  Optional Flow still directory for thumbnail reference (default: FLOW_IMAGE_DIR)
  --output-dir <p>      Batch output directory (default: data/short-batch-cartoon)
  --help                Show this help

Visuals are 12 topic-specific local SVG + Sharp cartoon panels with Ken Burns
motion, xfade transitions, and burned voice captions. This is cartoon-style 2D
illustrated motion, not true AI character or object animation; that requires a
paid or external video model. No Gemini image generation or paid Flow animation
is used. Review local MP4/SRT files before using --upload --public. Public
Shorts are capped at 20 per calendar day.
`);
}

function slugify(value) {
  return String(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function resolveFromRoot(value) {
  return path.resolve(ROOT, value);
}

async function listFlowImages(flowImageDir) {
  const entries = await fs.readdir(resolveFromRoot(flowImageDir), { withFileTypes: true });
  const supported = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  return entries
    .filter(entry => entry.isFile() && supported.has(path.extname(entry.name).toLowerCase()))
    .map(entry => path.join(resolveFromRoot(flowImageDir), entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function getVisualPlan(topicKey) {
  const plan = VISUAL_PLANS[topicKey];
  if (!plan) throw new Error(`No visual plan is defined for topic ${topicKey}`);
  if (plan.length !== VISUAL_BEATS_COUNT) {
    throw new Error(`Visual plan for ${topicKey} must contain ${VISUAL_BEATS_COUNT} scenes`);
  }
  return plan;
}

function buildVisualScenes(topic) {
  return getVisualPlan(topic.key).map((scene, index) => ({
    ...scene,
    accent: getPalette(`${topic.key}:${index}`).primary
  }));
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitle(title, maxLength = 24) {
  const words = String(title).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function thumbnailOverlay(topic) {
  const titleLines = wrapTitle(topic.title);
  const titleSvg = titleLines.map((line, index) => (
    `<tspan x="58" dy="${index === 0 ? 0 : 76}">${escapeXml(line)}</tspan>`
  )).join('');
  return `
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#061323" stop-opacity="0.94"/>
          <stop offset="0.7" stop-color="#061323" stop-opacity="0.38"/>
          <stop offset="1" stop-color="#061323" stop-opacity="0.08"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.75"/>
        </filter>
      </defs>
      <rect width="1280" height="720" fill="url(#shade)"/>
      <rect x="54" y="48" width="282" height="62" rx="14" fill="#f6c75d"/>
      <text x="195" y="89" text-anchor="middle" fill="#071522" font-family="Arial, sans-serif" font-size="29px" font-weight="900">FINANCE FACTS</text>
      <text x="58" y="270" fill="#ffffff" font-family="Arial, sans-serif" font-size="60px" font-weight="900" filter="url(#shadow)">${titleSvg}</text>
      <text x="58" y="650" fill="#f6c75d" font-family="Arial, sans-serif" font-size="27px" font-weight="700">Educational only | Returns are not guaranteed</text>
    </svg>`;
}

async function createLocalThumbnail(sourcePath, topic, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .resize(1280, 720, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(thumbnailOverlay(topic)) }])
    .jpeg({ quality: 90, progressive: true })
    .toFile(outputPath);
  return outputPath;
}

function buildYouTubeDescription(topic) {
  return `${topic.script}\n\nSource: ${topic.source}\n\n${DISCLAIMER}\n\n#Shorts #PersonalFinance #FinancialLiteracy`;
}

function sanitizeTags(tags = []) {
  const result = [];
  let total = 0;
  for (const tag of tags) {
    const value = String(tag).trim();
    if (!value || total + value.length + 1 > 500) continue;
    result.push(value);
    total += value.length + 1;
  }
  return result;
}

async function readManifest(manifestPath) {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.items ||= {};
    return manifest;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { version: 1, status: 'preview', items: {} };
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  try {
    await fs.rename(temporaryPath, filePath);
  } catch {
    await fs.rm(filePath, { force: true }).catch(() => {});
    await fs.rename(temporaryPath, filePath);
  }
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

function itemPaths(outputDir, topic) {
  const itemDir = path.join(outputDir, 'items', `${String(topic.index).padStart(2, '0')}-${slugify(topic.key)}`);
  return {
    itemDir,
    audio: path.join(itemDir, 'narration.mp3'),
    illustrationsDir: path.join(itemDir, 'illustrations'),
    cardsDir: path.join(itemDir, 'cards'),
    video: path.join(itemDir, `${slugify(topic.key)}.mp4`),
    srt: path.join(itemDir, `${slugify(topic.key)}.srt`),
    thumbnail: path.join(itemDir, `${slugify(topic.key)}-thumbnail.jpg`)
  };
}

async function generatedFilesAreReady(files, expectedIllustrations = VISUAL_BEATS_COUNT) {
  if (!await fileExists(files.video) || !await fileExists(files.srt) || !await fileExists(files.thumbnail)) {
    return false;
  }
  try {
    const entries = await fs.readdir(files.illustrationsDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png').length >= expectedIllustrations;
  } catch {
    return false;
  }
}

async function createSilentAudio(outputPath, duration) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFFmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=r=24000:cl=mono',
    '-t', String(duration),
    '-c:a', 'libmp3lame',
    '-q:a', '9',
    outputPath
  ]);
  return outputPath;
}

async function generateNarration(generator, topic, audioPath, allowSilent) {
  if (await isUsableAudioFile(audioPath)) return { path: audioPath, provider: 'cached narration', silent: false };

  await fs.mkdir(path.dirname(audioPath), { recursive: true });
  const configuredProvider = process.env.SHORT_BATCH_TTS_PROVIDER || process.env.TTS_PROVIDER;
  if ((configuredProvider === 'windows' || configuredProvider === 'system') && canUseWindowsSpeech()) {
    await generateWindowsSpeech(topic.script, audioPath);
    return { path: audioPath, provider: 'Windows System.Speech', silent: false };
  }
  const preferGemini = generator.gemini && (!configuredProvider || configuredProvider === 'auto' || configuredProvider === 'gemini');
  const previousProvider = process.env.TTS_PROVIDER;
  if (preferGemini) process.env.TTS_PROVIDER = 'gemini';

  try {
    const generatedPath = await generator.generateTTSAudio(topic.script, audioPath);
    if (!await isUsableAudioFile(generatedPath)) {
      throw new Error('TTS provider returned a simulation or empty audio file');
    }
    return { path: generatedPath, provider: 'AIVideoGenerator TTS', silent: false };
  } catch (error) {
    let narrationError = error;
    if (canUseWindowsSpeech()) {
      try {
        await generateWindowsSpeech(topic.script, audioPath);
        return { path: audioPath, provider: 'Windows System.Speech fallback', silent: false };
      } catch (localError) {
        narrationError = new Error(`${error.message}; Windows Speech fallback failed: ${localError.message}`);
      }
    }
    if (!allowSilent) {
      throw new Error(`Narration failed for ${topic.key}; refusing a silent Short: ${narrationError.message}`);
    }
    const duration = estimateNarrationDuration(topic.script);
    await createSilentAudio(audioPath, duration);
    return { path: audioPath, provider: 'intentional silent preview', silent: true };
  } finally {
    if (preferGemini) {
      if (previousProvider === undefined) delete process.env.TTS_PROVIDER;
      else process.env.TTS_PROVIDER = previousProvider;
    }
  }
}

async function generateItem(topic, flowImages, generator, options, manifest, manifestPath) {
  const files = itemPaths(options.outputDir, topic);
  const scenes = buildVisualScenes(topic);
  const visualKinds = scenes.map(scene => scene.kind);
  const checkpoint = manifest.items[topic.key] || {
    key: topic.key,
    index: topic.index,
    title: topic.title,
    status: 'pending'
  };
  const wasCartoonCheckpoint = checkpoint.renderVersion === RENDER_VERSION
    && checkpoint.visualStyle === VISUAL_STYLE
    && checkpoint.visualBeats === VISUAL_BEATS_COUNT;
  if (checkpoint.youtube?.id && !wasCartoonCheckpoint) {
    throw new Error(`Refusing to mix an older YouTube checkpoint into the ${RENDER_VERSION} render for ${topic.key}`);
  }
  checkpoint.files = {
    video: files.video,
    srt: files.srt,
    thumbnail: files.thumbnail,
    audio: files.audio,
    illustrations: files.illustrationsDir,
    cards: files.cardsDir
  };
  checkpoint.isShort = true;
  checkpoint.contentType = 'short';
  checkpoint.aspectRatio = '9:16';
  checkpoint.renderVersion = RENDER_VERSION;
  checkpoint.visualStyle = VISUAL_STYLE;
  checkpoint.visualKinds = visualKinds;
  checkpoint.visualBeats = scenes.length;
  checkpoint.visualPlan = scenes.map(scene => ({
    title: scene.title,
    detail: scene.detail,
    kind: scene.kind
  }));
  manifest.items[topic.key] = checkpoint;
  await writeJson(manifestPath, manifest);

  const canReuse = wasCartoonCheckpoint
    && await generatedFilesAreReady(files, scenes.length);
  if (canReuse) {
    console.log(`Reusing local files for ${topic.key}`);
    checkpoint.status = checkpoint.youtube ? 'uploaded' : 'generated';
    delete checkpoint.error;
    await writeJson(manifestPath, manifest);
    return { checkpoint, files };
  }

  try {
    const narration = await generateNarration(generator, topic, files.audio, options.allowSilent);
    const illustrationPaths = await createCartoonIllustrations(
      scenes,
      files.illustrationsDir,
      { topicKey: topic.key }
    );
    await renderShortVideo({
      sourceImages: illustrationPaths,
      scenes,
      narrationText: topic.script,
      audioPath: narration.path,
      outputPath: files.video,
      srtPath: files.srt,
      cardsDir: files.cardsDir,
      allowSilent: options.allowSilent,
      captionMaxWords: 6,
      fadeDuration: 0.45
    });
    const thumbnailSource = illustrationPaths[0] || flowImages[topic.index % flowImages.length];
    await createLocalThumbnail(thumbnailSource, topic, files.thumbnail);
    checkpoint.status = 'generated';
    delete checkpoint.error;
    checkpoint.silentAudio = narration.silent;
    checkpoint.narrationProvider = narration.provider;
    checkpoint.generatedAt = new Date().toISOString();
    await writeJson(manifestPath, manifest);
    return { checkpoint, files };
  } catch (error) {
    checkpoint.status = 'failed';
    checkpoint.error = error.message;
    await writeJson(manifestPath, manifest);
    throw error;
  }
}

async function attachThumbnail(youtube, videoId, thumbnailPath) {
  await youtube.thumbnails.set({
    videoId,
    media: { body: fsSync.createReadStream(thumbnailPath) }
  });
}

async function attachCaptions(youtube, videoId, captionsPath) {
  await youtube.captions.insert({
    part: 'snippet',
    requestBody: {
      snippet: {
        videoId,
        language: 'en',
        name: 'English burned-caption transcript',
        isDraft: false
      }
    },
    media: { body: fsSync.createReadStream(captionsPath) }
  });
}

async function uploadItem(youtube, topic, checkpoint, files, options, manifest, manifestPath) {
  if (!checkpoint.youtube?.id) {
    const publicShort = options.publicUpload === true;
    const reservation = publicShort ? await reservePublicShort(`short-batch:${topic.key}`) : null;
    let inserted = false;
    try {
      const response = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: topic.title.slice(0, 100),
            description: buildYouTubeDescription(topic).slice(0, 5000),
            tags: sanitizeTags(topic.tags),
            categoryId: CATEGORY_ID,
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en'
          },
          status: {
            privacyStatus: publicShort ? 'public' : 'private',
            selfDeclaredMadeForKids: false
          }
        },
        media: { body: fsSync.createReadStream(files.video) }
      });
      const id = response.data.id;
      if (!id) throw new Error(`YouTube did not return an ID for ${topic.key}`);
      inserted = true;
      if (reservation) await markPublicShortUploaded(reservation.key);
      checkpoint.youtube = {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        privacyStatus: publicShort ? 'public' : 'private',
        uploadedAt: new Date().toISOString(),
        thumbnailAttached: false,
        captionsAttached: false
      };
      checkpoint.status = 'uploaded';
      await writeJson(manifestPath, manifest);
      console.log(`Uploaded ${topic.key}: ${id}`);
    } catch (error) {
      if (reservation && !inserted) await releasePublicShort(reservation.key).catch(() => {});
      throw error;
    }
  } else {
    console.log(`Reusing YouTube checkpoint for ${topic.key}: ${checkpoint.youtube.id}`);
  }

  if (!options.skipThumbnails && !checkpoint.youtube.thumbnailAttached) {
    await attachThumbnail(youtube, checkpoint.youtube.id, files.thumbnail);
    checkpoint.youtube.thumbnailAttached = true;
    await writeJson(manifestPath, manifest);
  } else if (options.skipThumbnails && !checkpoint.youtube.thumbnailAttached) {
    checkpoint.youtube.thumbnailPending = true;
    await writeJson(manifestPath, manifest);
  }

  if (options.uploadCaptions && !checkpoint.youtube.captionsAttached) {
    try {
      await attachCaptions(youtube, checkpoint.youtube.id, files.srt);
      checkpoint.youtube.captionsAttached = true;
      await writeJson(manifestPath, manifest);
    } catch (error) {
      if (!/insufficient authentication scopes/i.test(error.message || '')) throw error;
      console.warn(`Captions attachment skipped for ${topic.key}: OAuth token lacks the captions scope`);
    }
  }
}

async function runBatch(options) {
  validateOptions(options);
  const resolvedOutputDir = resolveFromRoot(options.outputDir);
  if (resolvedOutputDir.toLowerCase() === LEGACY_BATCH_DIR.toLowerCase()) {
    throw new Error('The legacy data/short-batch directory is preserved; use the default data/short-batch-cartoon output directory');
  }
  options.outputDir = resolvedOutputDir;
  options.flowImageDir = resolveFromRoot(options.flowImageDir);
  await fs.mkdir(options.outputDir, { recursive: true });
  const manifestPath = path.join(options.outputDir, 'manifest.json');
  const manifest = await readManifest(manifestPath);
  manifest.version = 2;
  manifest.renderVersion = RENDER_VERSION;
  manifest.visualStyle = VISUAL_STYLE;
  manifest.visualBeats = VISUAL_BEATS_COUNT;
  manifest.status = options.upload ? (options.publicUpload ? 'public_uploading' : 'private_uploading') : 'preview';
  manifest.count = options.count;
  manifest.publicUpload = options.publicUpload;
  manifest.generatedAt = manifest.generatedAt || new Date().toISOString();
  await writeJson(manifestPath, manifest);

  let sourceImages = [];
  try {
    sourceImages = await listFlowImages(options.flowImageDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (sourceImages.length === 0) {
    console.log('No Flow stills found; using local cartoon panels for visuals and thumbnails.');
  }

  const credentialManager = new CredentialManager();
  const initialized = await credentialManager.initialize();
  if (options.upload && !initialized) throw new Error('Could not load YouTube credentials for batch upload');
  const generator = new AIVideoGenerator(credentialManager.credentials);
  let youtube = null;
  let channel = null;
  if (options.upload) {
    youtube = credentialManager.getYouTubeClient();
    const channelResponse = await youtube.channels.list({ part: 'snippet', mine: true });
    channel = channelResponse.data.items?.[0];
    if (!channel) throw new Error('No authenticated YouTube channel was found');
    if (channel.snippet.title !== EXPECTED_CHANNEL) {
      throw new Error(`Authenticated channel is "${channel.snippet.title}", expected "${EXPECTED_CHANNEL}"`);
    }
    manifest.channel = { id: channel.id, title: channel.snippet.title };
  }

  const topics = FINANCE_TOPICS.slice(0, options.count);
  for (let index = 0; index < topics.length; index += 1) {
    const topic = topics[index];
    const result = await generateItem(topic, sourceImages, generator, options, manifest, manifestPath);
    if (youtube) {
      await uploadItem(youtube, topic, result.checkpoint, result.files, options, manifest, manifestPath);
      if (index < topics.length - 1 && DEFAULT_UPLOAD_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, DEFAULT_UPLOAD_DELAY_MS));
      }
    }
  }

  manifest.status = options.upload ? 'uploaded' : 'preview_ready';
  manifest.completedCount = topics.filter(topic => manifest.items[topic.key]?.status === 'uploaded' || manifest.items[topic.key]?.status === 'generated').length;
  manifest.finishedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
  return { manifestPath, count: topics.length, uploaded: Boolean(youtube), publicUpload: options.publicUpload };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await runBatch(options);
  console.log(JSON.stringify(result, null, 2));
  if (!options.upload) console.log('Preview complete. Upload skipped; review the MP4, SRT, and manifest before using --upload.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Short batch failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DISCLAIMER,
  FINANCE_TOPICS,
  MAX_COUNT,
  RENDER_VERSION,
  VISUAL_BEATS_COUNT,
  VISUAL_PLANS,
  VISUAL_STYLE,
  buildVisualScenes,
  getVisualPlan,
  parseArgs,
  runBatch,
  validateOptions
};
