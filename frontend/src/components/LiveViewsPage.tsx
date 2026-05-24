import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, Link as LinkIcon, ShieldOff, Cctv, Copy, Check } from 'lucide-react';
import { api } from '../api';
import type { CameraStatus, LiveView } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LiveViewsPageProps {
  cameras: CameraStatus[];
  onEdit: (id: string) => void;
  onNew: () => void;
  onToast: (msg: string, type?: 'error' | 'success' | 'info') => void;
}

/**
 * Index of saved Live Views. Each card shows the layout name, tile count,
 * and (when the kiosk token is enabled) a one-click copy button for the
 * public URL — paste it into a TV browser to mount the view on a wall.
 */
export default function LiveViewsPage({ cameras, onEdit, onNew, onToast }: LiveViewsPageProps) {
  const [views, setViews] = useState<LiveView[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .listLiveViews()
      .then(setViews)
      .catch((e) => onToast(`Failed to load Live Views: ${e instanceof Error ? e.message : e}`));
  }, [onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete Live View "${name}"?`)) return;
    try {
      await api.deleteLiveView(id);
      onToast(`"${name}" deleted`, 'success');
      reload();
    } catch (e) {
      onToast(`Failed to delete: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleMint = async (id: string) => {
    try {
      const res = await api.mintKioskToken(id);
      await navigator.clipboard.writeText(res.url).catch(() => {});
      onToast('Kiosk URL copied to clipboard', 'success');
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
      reload();
    } catch (e) {
      onToast(`Failed to mint kiosk token: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.revokeKioskToken(id);
      onToast('Kiosk token revoked', 'success');
      reload();
    } catch (e) {
      onToast(`Failed to revoke kiosk token: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleCopy = async (id: string, token: string) => {
    const url = `${window.location.origin}/live/${id}?token=${encodeURIComponent(token)}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    onToast('Kiosk URL copied to clipboard', 'success');
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  };

  if (views === null) {
    return <div className="text-sm text-muted-foreground py-6">Loading Live Views…</div>;
  }

  if (views.length === 0) {
    return (
      <div className="relative min-h-[55vh] grid place-items-center animate-rise">
        <div className="absolute inset-0 [background:radial-gradient(circle_at_center,hsl(var(--signal)/0.06),transparent_60%)] pointer-events-none" />
        <div className="relative text-center space-y-4 max-w-sm">
          <div className="mx-auto w-20 h-20 rounded-2xl border border-border bg-card/40 grid place-items-center backdrop-blur-sm shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] text-muted-foreground/70">
            <Cctv className="w-9 h-9" />
          </div>
          <div>
            <div className="label-eyebrow text-primary/70 mb-1">empty</div>
            <p className="text-foreground font-medium">No Live Views yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compose a layout of cameras and display it on any browser, TV, or kiosk.
            </p>
          </div>
          <Button onClick={onNew} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Live View
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Saved multi-camera dashboards. Open <span className="font-data">/live/&lt;id&gt;</span> in
          a browser to display one on any screen.
        </p>
        <Button onClick={onNew} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New Live View
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-rise-stagger">
        {views.map((v) => {
          const cameraCount = new Set(v.tiles.map((t) => t.camera_id)).size;
          const missing = v.tiles.filter((t) => !cameras.find((c) => c.id === t.camera_id)).length;
          const hasKiosk = !!v.kiosk_token;
          return (
            <div key={v.id} className="surface-panel rounded-lg p-4 space-y-3">
              <div>
                <div className="label-eyebrow text-primary/70 mb-1">live view</div>
                <h3 className="text-base font-medium text-foreground">{v.name}</h3>
              </div>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[0.6875rem] font-data text-muted-foreground tabular-nums">
                <span>
                  <span className="text-muted-foreground/60 label-hud">canvas</span>{' '}
                  <span className="text-foreground/80">
                    {v.canvas.w}×{v.canvas.h}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground/60 label-hud">tiles</span>{' '}
                  <span className="text-foreground/80">
                    {v.tiles.length} ({cameraCount} cam{cameraCount === 1 ? '' : 's'})
                  </span>
                </span>
                {missing > 0 && (
                  <span className="chip chip-warm !py-0 !px-1.5">{missing} missing</span>
                )}
                {hasKiosk && <span className="chip chip-good !py-0 !px-1.5">kiosk on</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(v.id)}>
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
                {hasKiosk ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn('h-8', copiedId === v.id && 'text-emerald-300 border-emerald-600/30')}
                      onClick={() => handleCopy(v.id, v.kiosk_token!)}
                    >
                      {copiedId === v.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1.5" /> Kiosk URL
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-amber-300 border-amber-600/30 hover:bg-amber-600/10"
                      onClick={() => handleRevoke(v.id)}
                    >
                      <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> Revoke
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => handleMint(v.id)}>
                    <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Enable kiosk URL
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleDelete(v.id, v.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
