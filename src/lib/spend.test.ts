import { describe, expect, it } from 'vitest';
import { isSpendTalk, parseBankSms, parseSpends } from './intent';
import { DEFAULT_CATEGORIES } from './money';

const cats = DEFAULT_CATEGORIES;
const one = (t: string, m: Record<string, string> = {}) => {
  const [s] = parseSpends(t, cats, m);
  return s ? `${s.amount} ${s.category ?? '?'}${s.note ? ` "${s.note}"` : ''}${s.mode ? ` ${s.mode}` : ''}${s.day === 'yesterday' ? ' y' : ''}` : 'none';
};

describe('is it about money?', () => {
  it.each([
    ['25 rupees groceries', true],
    ['paid 475 on blinkit via amazon pay', true],
    ['200 auto', true],
    ['₹90 chai', true],
    ['spent 1.5k on dinner', true],
    ['drank 500 ml water', false],
    ['gym tomorrow at 7', false],
    ['read 10 pages', false],
    ['I meditated', false],
  ])('%s → %s', (t, want) => expect(isSpendTalk(t, cats)).toBe(want));
});

describe('spends', () => {
  it.each([
    ['25 rupees groceries', '25 groceries'],
    ['25 rupees for grocery', '25 groceries'],
    ['paid 475 rupees on blinkit via amazon pay', '475 groceries "Blinkit" Amazon Pay'],
    ['200 auto', '200 transport'],
    ['spent 1.5k on dinner yesterday', '1500 eating y'],
    ['₹90 chai by cash', '90 eating Cash'],
    ['1,200 electricity bill gpay', '1200 bills "Electricity bill" UPI'],
    ['300 rupees to Ramesh', '300 ? "Ramesh"'],
    ['450 at Sharma store', '450 groceries "Sharma store"'],
  ])('%s → %s', (t, want) => expect(one(t, want.includes('Sharma') ? { 'sharma store': 'groceries' } : {})).toBe(want));

  it('several in one go', () => {
    const s = parseSpends('50 chai and 200 auto', cats);
    expect(s.map((x) => `${x.amount} ${x.category}`)).toEqual(['50 eating', '200 transport']);
  });
});

describe('bank SMS', () => {
  it.each([
    ['Rs.475.00 debited from A/c XX1234 on 24-11-26 to VPA blinkit.ybl@ybl (UPI Ref No 432112345678). Not you? Call 18002586161', 475, 'Blinkit ybl', 'UPI'],
    ['Sent Rs.25.00 From HDFC Bank A/C *1234 To RAMESH KIRANA STORE On 24/11/26 Ref 432198765432 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808', 25, 'RAMESH KIRANA STORE', 'UPI'],
    ['INR 1,299.00 spent on ICICI Bank Card XX4321 on 24-Nov-26 at AMAZON PAY INDIA. Avl Lmt: INR 85,000', 1299, 'AMAZON PAY INDIA', 'Card'],
    ['Your a/c XX1234 is debited for Rs. 2,450.50 on 24-11-2026 towards Swiggy. UPI Ref 1234', 2450.5, 'Swiggy', 'UPI'],
  ])('%s', (sms, amount, merchant, mode) => {
    const p = parseBankSms(sms)!;
    expect(p.amount).toBe(amount);
    expect(p.merchant?.toLowerCase()).toBe((merchant as string).toLowerCase());
    expect(p.mode).toBe(mode);
  });
  it('ignores credits and OTPs', () => {
    expect(parseBankSms('Rs.5000 credited to your A/c XX1234 by NEFT')).toBeNull();
    expect(parseBankSms('123456 is your OTP for a transaction of Rs.500 at Flipkart')).toBeNull();
  });
});
