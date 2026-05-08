import { isValidIpOrCidr } from '../cidr';

describe('isValidIpOrCidr', () => {
  it.each([
    ['1.2.3.4', true],
    ['1.2.3.4/24', true],
    ['255.255.255.255', true],
    ['0.0.0.0/0', true],
    ['', false],
    ['1.2.3', false],
    ['1.2.3.4.5', false],
    ['1.2.3.4/33', false],
    ['1.2.3.4/-1', false],
    ['1.2.3.999', false],
    ['abc.def.ghi.jkl', false],
    ['1.2.3.4/abc', false],
  ])('%s → %s', (input, expected) => {
    expect(isValidIpOrCidr(input)).toBe(expected);
  });
});
