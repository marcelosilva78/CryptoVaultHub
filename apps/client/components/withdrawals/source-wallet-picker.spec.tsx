import { render, screen, fireEvent } from '@testing-library/react';
import { SourceWalletPicker } from './source-wallet-picker';

describe('SourceWalletPicker', () => {
  const noop = () => {};

  it('renders both cards with balances and addresses', () => {
    render(
      <SourceWalletPicker
        chainId={56}
        selected="hot"
        hot={{ address: '0x17193A58d73825485393E00ecE33051Fa2536415', balance: '0.005' }}
        gasTank={{ address: '0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={noop}
      />,
    );
    expect(screen.getByText(/Hot Wallet/)).toBeInTheDocument();
    expect(screen.getByText(/Gas Tank/)).toBeInTheDocument();
    expect(screen.getByText('0.005 BNB')).toBeInTheDocument();
    expect(screen.getByText('0.010 BNB')).toBeInTheDocument();
    expect(screen.getByText(/0x17193A/)).toBeInTheDocument();
    expect(screen.getByText(/0x54f55b/)).toBeInTheDocument();
  });

  it('marks the selected card as active and unselected as inactive', () => {
    render(
      <SourceWalletPicker
        chainId={56}
        selected="gas_tank"
        hot={{ address: '0xhot', balance: '0.005' }}
        gasTank={{ address: '0xgas', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={noop}
      />,
    );
    const hotCard = screen.getByRole('button', { name: /Hot Wallet/i });
    const gasCard = screen.getByRole('button', { name: /Gas Tank/i });
    expect(gasCard).toHaveAttribute('aria-pressed', 'true');
    expect(hotCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when the user clicks the inactive card', () => {
    const onChange = jest.fn();
    render(
      <SourceWalletPicker
        chainId={56}
        selected="hot"
        hot={{ address: '0xhot', balance: '0.005' }}
        gasTank={{ address: '0xgas', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gas Tank/i }));
    expect(onChange).toHaveBeenCalledWith('gas_tank');
  });
});
