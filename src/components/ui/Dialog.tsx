import * as React from "react";
import { DismissRegular } from "@fluentui/react-icons";
import { Button } from "./Button";

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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex flex-col w-full max-w-md rounded-(--wb-radius-lg) bg-(--wb-surface-flyout) border border-(--wb-border-default) shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-black/5 border-b border-(--wb-border-subtle)">
          <div className="flex items-center gap-2">
            {icon && <span className="text-(--wb-accent) text-lg">{icon}</span>}
            <h3 className="text-base font-semibold text-(--wb-text-primary)">
              {title}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            icon={<DismissRegular />}
          />
        </div>

        <div className="px-6 py-4">
          {description && (
            <p className="text-sm text-(--wb-text-secondary) mb-4">
              {description}
            </p>
          )}
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 bg-black/10 border-t border-(--wb-border-subtle)">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
