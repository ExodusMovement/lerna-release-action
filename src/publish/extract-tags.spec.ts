import { extractTags } from './extract-tags'
import { PUBLISH_OUTPUT } from './fixture'

describe('extractTags', () => {
  it('should extractTags from lerna publish output', () => {
    expect(extractTags(PUBLISH_OUTPUT)).toEqual([
      '@exodus/arkham-asylum@2.1.7-alpha.1',
      '@exodus/wayne-manor@1.9.12',
    ])
  })
})
