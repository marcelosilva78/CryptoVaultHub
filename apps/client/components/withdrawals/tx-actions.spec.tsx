import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TxActions } from './tx-actions';
import * as clipboard from '@/lib/clipboard';

jest.mock('@/lib/clipboard');

describe('TxActions', () => {
  const tx = '0xabc';

  beforeEach(() => {
    (clipboard.copyToClipboard as jest.Mock).mockResolvedValue(true);
    Object.defineProperty(window, 'open', { value: jest.fn(), configurable: true });
  });

  it('disables both buttons when txHash is null', () => {
    render(<TxActions txHash={null} chainId={56} />);
    expect(screen.getByLabelText('Copy tx hash')).toBeDisabled();
    expect(screen.getByLabelText('Open in explorer')).toBeDisabled();
  });

  it('copy invokes clipboard.copyToClipboard with the tx hash', async () => {
    render(<TxActions txHash={tx} chainId={56} />);
    fireEvent.click(screen.getByLabelText('Copy tx hash'));
    await waitFor(() =>
      expect(clipboard.copyToClipboard).toHaveBeenCalledWith(tx),
    );
  });

  it('open dispatches window.open with the BSC explorer URL', () => {
    render(<TxActions txHash={tx} chainId={56} />);
    fireEvent.click(screen.getByLabelText('Open in explorer'));
    expect(window.open).toHaveBeenCalledWith(
      `https://bscscan.com/tx/${tx}`,
      '_blank',
      'noopener,noreferrer',
    );
  });
});
