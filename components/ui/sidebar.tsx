"use client";

import * as React from "react";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "13.75rem";
const SIDEBAR_WIDTH_MOBILE = "14.5rem";
const SIDEBAR_WIDTH_ICON = "3.25rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener("change", onChange);

    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [_open, _setOpen] = React.useState(defaultOpen);

  const open = openProp ?? _open;

  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      const nextOpen = typeof value === "function" ? value(open) : value;

      if (setOpenProp) {
        setOpenProp(nextOpen);
      } else {
        _setOpen(nextOpen);
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [open, setOpenProp],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }

    setOpen((current) => !current);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== SIDEBAR_KEYBOARD_SHORTCUT ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  return (
    <SidebarContext.Provider
      value={{
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarProps = React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
};

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: SidebarProps) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        data-side={side}
        data-variant={variant}
        className={cn(
          "flex h-full w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Dialog open={openMobile} onOpenChange={setOpenMobile}>
        <DialogContent
          className={cn(
            "top-0 h-[100dvh] w-[var(--sidebar-width-mobile)] max-w-none translate-y-0 gap-0 rounded-none border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-2xl",
            side === "left"
              ? "left-0 translate-x-0 border-r data-[state=closed]:slide-out-to-left-full data-[state=open]:slide-in-from-left-full"
              : "right-0 left-auto translate-x-0 border-l data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
          )}
        >
          <DialogTitle className="sr-only">Sidebar</DialogTitle>
          <div
            data-slot="sidebar"
            data-mobile="true"
            className="flex h-full w-full flex-col bg-sidebar"
          >
            {children}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      className="group peer hidden text-sidebar-foreground md:block"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative h-svh w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem)]"
            : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
        )}
      />

      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex",
          "data-[side=left]:left-0 data-[side=right]:right-0",
          "data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]",
          "data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          variant === "floating" || variant === "inset"
            ? "p-1.5 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+0.75rem)]"
            : "border-sidebar-border group-data-[side=left]:border-r group-data-[side=right]:border-l group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
          className,
        )}
        {...props}
      >
        <div
          data-slot="sidebar-inner"
          className={cn(
            "flex h-full w-full flex-col bg-sidebar",
            variant === "floating" &&
              "border border-sidebar-border shadow-[0_12px_30px_rgba(15,23,42,0.14)]",
            variant === "inset" &&
              "border border-sidebar-border shadow-[0_12px_30px_rgba(15,23,42,0.14)]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarInset({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-h-svh min-w-0 flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-1",
        "md:peer-data-[variant=inset]:shadow-[0_8px_22px_rgba(15,23,42,0.07)]",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-slot="sidebar-trigger"
      className={cn(
        "h-6 w-6 rounded-none border border-border bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          toggleSidebar();
        }
      }}
      {...props}
    >
      {children ?? <PanelLeft className="size-4 rtl:rotate-180" />}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function SidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all after:absolute after:inset-y-0 after:w-px after:bg-sidebar-border hover:after:bg-sidebar-ring sm:flex",
        "group-data-[side=left]:-right-2 group-data-[side=left]:after:left-1/2",
        "group-data-[side=right]:-left-2 group-data-[side=right]:after:right-1/2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-1.5 p-1.5", className)}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("mt-auto flex flex-col gap-1.5 p-1.5", className)}
      {...props}
    />
  );
}

export function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-separator"
      className={cn("mx-2 h-px bg-sidebar-border", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col px-1.5", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-6 shrink-0 items-center rounded-none px-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45 transition-[margin,opacity] duration-200 group-data-[collapsible=icon]:-mt-6 group-data-[collapsible=icon]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupAction({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="sidebar-group-action"
      className={cn(
        "absolute right-3 top-2 flex size-6 items-center justify-center rounded-none text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn("w-full", className)}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-none px-2.5 py-1.5 text-left text-xs font-medium text-sidebar-foreground/72 outline-none ring-sidebar-ring transition-[width,height,padding,color,background-color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0 [&_svg]:size-3.5 [&_svg]:shrink-0 [&>span:last-child]:truncate group-data-[collapsible=icon]:[&>span:last-child]:hidden",
  {
    variants: {
      size: {
        default: "h-8",
        sm: "h-7 text-[11px]",
        lg: "h-9 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  size,
  className,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      title={tooltip}
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      {...props}
    />
  );
}

export function SidebarMenuAction({
  className,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  showOnHover?: boolean;
}) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-action"
      className={cn(
        "absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-none text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden",
        showOnHover && "opacity-0 group-hover/menu-item:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      className={cn(
        "absolute right-2.5 top-1/2 -translate-y-1/2 rounded-none bg-sidebar-primary/16 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  const width = React.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={cn(
        "flex h-8 items-center gap-2 rounded-none px-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
        className,
      )}
      {...props}
    >
      {showIcon ? (
        <div className="size-3.5 animate-pulse rounded-none bg-sidebar-accent" />
      ) : null}
      <div
        className="h-3 animate-pulse rounded-none bg-sidebar-accent group-data-[collapsible=icon]:hidden"
        style={{ width }}
      />
    </div>
  );
}

export function SidebarMenuSub({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        "mx-2.5 flex min-w-0 translate-x-px flex-col gap-0.5 border-l border-sidebar-border px-2 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-sub-item" className={cn(className)} {...props} />;
}

const sidebarMenuSubButtonVariants = cva(
  "flex min-w-0 items-center gap-2 overflow-hidden rounded-none px-2 py-1 text-xs text-sidebar-foreground/68 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>span:last-child]:truncate [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-7",
        sm: "h-6 text-[11px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export function SidebarMenuSubButton({
  asChild = false,
  size,
  className,
  ...props
}: React.ComponentProps<"a"> &
  VariantProps<typeof sidebarMenuSubButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      className={cn(sidebarMenuSubButtonVariants({ size }), className)}
      {...props}
    />
  );
}
