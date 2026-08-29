import { afterEach, describe, expect, it } from 'vitest'
import {
  GARDEN_BEDS,
  GRID_COLS,
  GRID_PAD_TOP,
  GRID_ROWS,
  MIN_PATCH_H,
  MIN_PATCH_W,
  bedById,
  fourWideMin,
  gridShapeForView,
  layoutCourtyard,
} from './beds'
import {
  FOX_H,
  FOX_H_BASE,
  FOX_W,
  FOX_W_BASE,
  MAILBOX,
  MAILBOX_H,
  MAILBOX_H_PORTRAIT,
  MAILBOX_W,
  MAILBOX_W_PORTRAIT,
  placeCritters,
  syncMailboxForView,
} from './critters'

afterEach(() => {
  syncMailboxForView(4, 2)
  layoutCourtyard(320, 200, 4, 2)
  placeCritters()
})

describe('gridShapeForView', () => {
  it('uses 2×4 on portrait glass and 4×2 on landscape', () => {
    expect(fourWideMin()).toBe(320)
    expect(gridShapeForView(390, 844)).toEqual({ cols: 2, rows: 4 })
    expect(gridShapeForView(320, 200)).toEqual({ cols: 4, rows: 2 })
    expect(gridShapeForView(400, 300)).toEqual({ cols: 4, rows: 2 })
    expect(gridShapeForView(900, 600)).toEqual({ cols: 4, rows: 2 })
    expect(gridShapeForView(319, 200)).toEqual({ cols: 2, rows: 4 })
  })
})

describe('layoutCourtyard', () => {
  it('grows dirt to fill leftover courtyard and keeps the mailbox walk', () => {
    const { padTop } = layoutCourtyard(640, 400, 4, 2)
    expect(padTop).toBe(GRID_PAD_TOP)
    expect(bedById('b0').w).toBeGreaterThan(MIN_PATCH_W)
    expect(bedById('b0').h).toBeGreaterThan(MIN_PATCH_H)
    expect(bedById('b3').x + bedById('b3').w).toBeGreaterThan(320)
    for (const bed of GARDEN_BEDS) {
      expect(bed.w).toBe(bedById('b0').w)
      expect(bed.h).toBe(bedById('b0').h)
    }
  })

  it('fills a tall 2×4 courtyard as two columns and four rows', () => {
    syncMailboxForView(2, 4)
    const { padTop } = layoutCourtyard(390, 700, 2, 4)
    expect(padTop).toBe(GRID_PAD_TOP)
    expect(GRID_COLS).toBe(2)
    expect(GRID_ROWS).toBe(4)
    expect(bedById('b0').w).toBeGreaterThan(MIN_PATCH_W)
    expect(bedById('b0').h).toBeGreaterThan(MIN_PATCH_H)
    expect(bedById('b3').y).toBe(padTop)
    expect(bedById('b3').x).toBeGreaterThan(bedById('b2').x)
    expect(bedById('f0').y).toBeGreaterThan(bedById('b0').y)
  })

  it('does not shrink below the floor size', () => {
    layoutCourtyard(320, 200, 4, 2)
    for (const bed of GARDEN_BEDS) {
      expect(bed.w).toBe(MIN_PATCH_W)
      expect(bed.h).toBe(MIN_PATCH_H)
    }
  })
})

describe('placeCritters', () => {
  it('parks the mailbox on the top walk at the back-right bed', () => {
    layoutCourtyard(640, 400, 4, 2)
    placeCritters()
    const b3 = bedById('b3')
    expect(MAILBOX.x).toBe(b3.x + b3.w - MAILBOX_W - 2)
    expect(MAILBOX.y + MAILBOX_H).toBeLessThanOrEqual(b3.y)
    expect(MAILBOX.x).toBeLessThan(b3.x + b3.w)
    expect(MAILBOX.x).toBeGreaterThan(b3.x)
    expect(FOX_W).toBe(FOX_W_BASE)
    expect(FOX_H).toBe(FOX_H_BASE)
  })

  it('uses the native mailbox sprite on a 2×4 courtyard', () => {
    syncMailboxForView(2, 4)
    layoutCourtyard(390, 700, 2, 4)
    placeCritters()
    expect(MAILBOX_W).toBe(MAILBOX_W_PORTRAIT)
    expect(MAILBOX_H).toBe(MAILBOX_H_PORTRAIT)
    expect(FOX_W).toBe(Math.round(FOX_W_BASE * 1.5))
    expect(FOX_H).toBe(Math.round(FOX_H_BASE * 1.5))
    expect(GRID_PAD_TOP).toBe(MAILBOX_H_PORTRAIT + 10)
    const top = bedById('b3')
    expect(MAILBOX.x).toBe(top.x + top.w - MAILBOX_W - 2)
    expect(MAILBOX.y + MAILBOX_H).toBeLessThanOrEqual(top.y)
  })
})
