import { runDueAgents } from '../../../server.mjs'

export default function handler(req, res) { return runDueAgents(req, res) }
