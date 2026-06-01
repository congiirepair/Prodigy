export function createFirestoreWriteService({ setDoc, deleteDoc, getRefs }) {
  return {
    publishEventShell(eventId, publicShell, privateConfig) {
      const refs = getRefs();
      return Promise.all([
        setDoc(refs.getEventDocRef(eventId), publicShell, { merge: true }),
        setDoc(refs.getEventPrivateConfigDocRef(eventId), privateConfig, { merge: true }),
      ]);
    },
    publishRegistration(eventId, registrationDoc, publicIndexDoc = null) {
      const refs = getRefs();
      const writes = [
        setDoc(refs.getEventRegistrationDocRef(eventId, registrationDoc.id), registrationDoc, { merge: true }),
      ];
      if (publicIndexDoc) {
        writes.push(setDoc(refs.getPublicRegistrationIndexDocRef(eventId, publicIndexDoc.publicId), publicIndexDoc, { merge: true }));
      }
      return Promise.all(writes);
    },
    publishRegistrationPatch(eventId, registrationId, patchDoc, publicIndexDoc = null) {
      const refs = getRefs();
      const writes = [
        setDoc(refs.getEventRegistrationDocRef(eventId, registrationId), patchDoc, { merge: true }),
      ];
      if (publicIndexDoc) {
        writes.push(setDoc(refs.getPublicRegistrationIndexDocRef(eventId, publicIndexDoc.publicId), publicIndexDoc, { merge: true }));
      }
      return Promise.all(writes);
    },
    publishDriver(eventId, driverDoc) {
      return setDoc(getRefs().getEventDriverDocRef(eventId, driverDoc.id), driverDoc, { merge: true });
    },
    publishBracket(eventId, bracketDoc, aggregateEntries = []) {
      const refs = getRefs();
      const writes = [
        setDoc(refs.getBracketDocRef(eventId, "main"), bracketDoc, { merge: true }),
        ...aggregateEntries.map(([key, value]) => setDoc(refs.getPublicAggregateDocRef(eventId, key), value, { merge: true })),
      ];
      return Promise.all(writes);
    },
    publishQualifyingRunAndJudgeSubmission(eventId, runId, runDoc, submissionId, submissionDoc) {
      const refs = getRefs();
      return Promise.all([
        setDoc(refs.getQualifyingRunDocRef(eventId, runId), runDoc, { merge: true }),
        setDoc(refs.getJudgeSubmissionDocRef(eventId, submissionId), submissionDoc, { merge: true }),
      ]);
    },
    publishBattleVote(eventId, voteId, voteDoc) {
      return setDoc(getRefs().getBattleVoteDocRef(eventId, voteId), voteDoc, { merge: true });
    },
    publishStreamState(eventId, payload) {
      return setDoc(getRefs().getNativeLiveStreamDocRef(eventId), payload, { merge: true });
    },
    publishArchive(payload) {
      return setDoc(getRefs().getArchivedResultsDocRef(), payload);
    },
    publishActiveEventSelection(activeEventPayload, directoryPayload) {
      const refs = getRefs();
      return Promise.all([
        setDoc(refs.getActiveEventSelectionDocRef(), activeEventPayload, { merge: true }),
        setDoc(refs.getDirectoryDocRef(), directoryPayload),
      ]);
    },
    deleteEvent(eventId) {
      return deleteDoc(getRefs().getEventDocRef(eventId));
    },
    publishSpecialEventShell(eventId, payload) {
      return setDoc(getRefs().getSpecialEventDocRef(eventId), payload, { merge: true });
    },
    publishSpecialEventRegistration(eventId, registrationDoc, publicIndexDoc = null) {
      const refs = getRefs();
      const writes = [
        setDoc(refs.getSpecialEventRegistrationDocRef(eventId, registrationDoc.id), registrationDoc, { merge: true }),
      ];
      if (publicIndexDoc) {
        writes.push(setDoc(refs.getSpecialEventPublicRegistrationIndexDocRef(eventId, publicIndexDoc.publicId), publicIndexDoc, { merge: true }));
      }
      return Promise.all(writes);
    },
    deleteSpecialEventRegistration(eventId, registrationId, publicId = null) {
      const refs = getRefs();
      const writes = [
        deleteDoc(refs.getSpecialEventRegistrationDocRef(eventId, registrationId)),
      ];
      if (publicId) {
        writes.push(deleteDoc(refs.getSpecialEventPublicRegistrationIndexDocRef(eventId, publicId)));
      }
      return Promise.all(writes);
    },
    publishSpecialEventRaffleTransaction(eventId, transactionDoc, registrationDoc, publicIndexDoc = null) {
      const refs = getRefs();
      const writes = [
        setDoc(refs.getSpecialEventRaffleTransactionDocRef(eventId, transactionDoc.id), transactionDoc, { merge: true }),
        setDoc(refs.getSpecialEventRegistrationDocRef(eventId, registrationDoc.id), registrationDoc, { merge: true }),
      ];
      if (publicIndexDoc) {
        writes.push(setDoc(refs.getSpecialEventPublicRegistrationIndexDocRef(eventId, publicIndexDoc.publicId), publicIndexDoc, { merge: true }));
      }
      return Promise.all(writes);
    },
    publishSpecialEventBracket(eventId, bracketDoc) {
      return setDoc(getRefs().getSpecialEventBracketDocRef(eventId, "main"), bracketDoc, { merge: true });
    },
    publishSpecialEventBattleResult(eventId, matchId, resultDoc, bracketDoc) {
      const refs = getRefs();
      return Promise.all([
        setDoc(refs.getSpecialEventBattleResultDocRef(eventId, matchId), resultDoc, { merge: true }),
        setDoc(refs.getSpecialEventBracketDocRef(eventId, "main"), bracketDoc, { merge: true }),
      ]);
    },
  };
}
