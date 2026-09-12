import { toJsonSchema } from 'xsschema'
import { z } from 'zod'
const empty = await toJsonSchema(z.object({}).strict())
console.log(JSON.stringify(empty))
