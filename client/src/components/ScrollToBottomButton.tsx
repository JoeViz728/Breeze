import { IconChevronDown } from './Icons';

interface Props {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({ visible, onClick }: Props) {
  return (
    <button
      type="button"
      className={`scroll-to-bottom-btn${visible ? ' scroll-to-bottom-btn--visible' : ''}`}
      onClick={onClick}
      aria-label="Jump to latest messages"
      title="Latest messages"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <IconChevronDown />
    </button>
  );
}