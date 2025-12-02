import { extractTags } from './extract-tags'
import { PUBLISH_OUTPUT, PUBLISH_OUTPUT_WITH_FAILURE } from '../__fixtures__/publish'

describe('extractTags', () => {
  it('extracts tags from lerna publish output', () => {
    expect(extractTags(PUBLISH_OUTPUT)).toEqual([
      '@exodus/pay-schemas@2.7.0',
      'secure-container@1.12.0',
    ])
  })

  it('extracts tags from lerna publish output with failure', () => {
    expect(extractTags(PUBLISH_OUTPUT_WITH_FAILURE)).toEqual(['@exodus/pay-schemas@2.8.0'])
  })
})
