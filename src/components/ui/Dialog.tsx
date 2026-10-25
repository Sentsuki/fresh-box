import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { DismissRegular } from "@fluentui/react-icons";
import { Button } from "./Button";

interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  /** 弹窗本体的尺寸/布局类，例如 `max-w-md`。 */
  className?: string;
  children: React.ReactNode;
}

/**
 * 遮罩 + 居中弹窗的外壳。Esc 关闭、点遮罩关闭、焦点陷阱、滚动锁定和进出场
 * 动画都由 Base UI 负责；`Dialog` 和需要自定义头尾的弹窗（连接详情）共用它。
 */
export function DialogShell({
  open,
  onClose,
  className = "",
  children,
}: DialogShellProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <BaseDialog.Popup
            className={[
              "flex flex-col w-full rounded-(--wb-radius-lg) bg-(--wb-surface-flyout) border border-(--wb-border-default) shadow-2xl overflow-hidden outline-none",
              "transition-[opacity,scale] duration-200",
              "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
              "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
              className,
            ].join(" ")}
          >
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const DialogTitle = BaseDialog.Title;
export const DialogDescription = BaseDialog.Description;

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  icon,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <DialogShell open={isOpen} onClose={onClose} className="max-w-md">
      <div className="flex items-center justify-between px-6 py-4 bg-black/5 border-b border-(--wb-border-subtle)">
        <div className="flex items-center gap-2">
          {icon && <span className="text-(--wb-accent) text-lg">{icon}</span>}
          <DialogTitle className="text-base font-semibold text-(--wb-text-primary)">
            {title}
          </DialogTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          icon={<DismissRegular />}
          aria-label="Close"
        />
      </div>

      <div className="px-6 py-4">
        {description && (
          <DialogDescription className="text-sm text-(--wb-text-secondary) mb-4">
            {description}
          </DialogDescription>
        )}
        {children}
      </div>

      {footer && (
        <div className="flex justify-end gap-2 px-6 py-4 bg-black/10 border-t border-(--wb-border-subtle)">
          {footer}
        </div>
      )}
    </DialogShell>
  );
}
