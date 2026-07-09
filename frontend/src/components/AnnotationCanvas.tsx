import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { Canvas, Rect, IText } from 'fabric'
import { Button } from './ui'

// Inline the pdf.js worker from the package
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker

interface AnnotationCanvasProps {
  pdfUrl: string
  onBurn: (fabricPayload: FabricPayload) => Promise<void>
}

export interface FabricPayload {
  pages: Array<{
    page_number: number
    objects: unknown[]
  }>
}

export function AnnotationCanvas({ pdfUrl, onBurn }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      try {
        const loadingTask = pdfjs.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        if (cancelled) return
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.25 })

        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = viewport.width
        pageCanvas.height = viewport.height
        const ctx = pageCanvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d ctx unavailable')
        await page.render({ canvasContext: ctx, canvas: pageCanvas, viewport }).promise
        if (cancelled) return

        if (containerRef.current) {
          containerRef.current.innerHTML = ''
          containerRef.current.appendChild(pageCanvas)
        }

        if (overlayRef.current) {
          overlayRef.current.width = viewport.width
          overlayRef.current.height = viewport.height
          const fab = new Canvas(overlayRef.current, {
            width: viewport.width,
            height: viewport.height,
            backgroundColor: 'transparent',
          })
          fabricRef.current = fab
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load PDF')
      }
    }

    void load()
    return () => {
      cancelled = true
      fabricRef.current?.dispose()
      fabricRef.current = null
    }
  }, [pdfUrl])

  function addRect() {
    const fab = fabricRef.current
    if (!fab) return
    fab.add(
      new Rect({
        left: 80,
        top: 80,
        width: 180,
        height: 48,
        fill: 'transparent',
        stroke: '#FF0000',
        strokeWidth: 2,
      }),
    )
    fab.requestRenderAll()
  }

  function addText() {
    const fab = fabricRef.current
    if (!fab) return
    fab.add(
      new IText('REJECTED', {
        left: 90,
        top: 90,
        fontSize: 20,
        fill: '#FF0000',
      }),
    )
    fab.requestRenderAll()
  }

  async function burn() {
    const fab = fabricRef.current
    if (!fab) return
    setSubmitting(true)
    try {
      const json = fab.toObject() as { objects: unknown[] }
      const payload: FabricPayload = {
        pages: [{ page_number: 1, objects: json.objects ?? [] }],
      }
      await onBurn(payload)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-sp4">
      <div className="flex gap-sp3">
        <Button variant="secondary" size="sm" onClick={addRect}>
          Add box
        </Button>
        <Button variant="secondary" size="sm" onClick={addText}>
          Add note
        </Button>
        <Button onClick={burn} loading={submitting}>
          Burn annotations
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-13 text-danger-500">
          {error}
        </p>
      ) : null}
      <div className="relative bg-paper-200 rounded-3 inline-block">
        <div ref={containerRef} />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 pointer-events-auto"
          aria-label="Annotation layer"
        />
      </div>
    </div>
  )
}
