import {
  generateUser,
  translate as t,
} from '../../../../helpers/api-integration.helper';

describe('Post /groups/:groupId/invite', () => {
  let inviter;
  let group;
  let groupName = 'Test Public Guild';

  beforeEach(async () => {
    inviter = await generateUser({balance: 1});
    group = await inviter.post('/groups', {
      name: groupName,
      type: 'guild',
    });
  });

  describe('user id invites', () => {
    it('returns an error when invited user is not found', async () => {
      let fakeID = '206039c6-24e4-4b9f-8a31-61cbb9aa3f66';

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [fakeID],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 404,
        error: 'NotFound',
        message: t('userWithIDNotFound', {userId: fakeID}),
      });
    });

    it('returns an error when uuids is not an array', async () => {
      let fakeID = '206039c6-24e4-4b9f-8a31-61cbb9aa3f66';

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: {fakeID},
      }))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('uuidsMustBeAnArray'),
      });
    });

    it('returns empty when uuids is empty', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [],
      }))
      .to.eventually.be.empty;
    });

    it('invites a user to a group by uuid', async () => {
      let userToInvite = await generateUser();

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInvite._id],
      })).to.eventually.deep.equal([{
        id: group._id,
        name: groupName,
        inviter: inviter._id,
      }]);
      await expect(userToInvite.get('/user'))
        .to.eventually.have.deep.property('invitations.guilds[0].id', group._id);
    });

    it('invites multiple users to a group by uuid', async () => {
      let userToInvite = await generateUser();
      let userToInvite2 = await generateUser();

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInvite._id, userToInvite2._id],
      })).to.eventually.deep.equal([
        {
          id: group._id,
          name: groupName,
          inviter: inviter._id,
        },
        {
          id: group._id,
          name: groupName,
          inviter: inviter._id,
        },
      ]);
      await expect(userToInvite.get('/user')).to.eventually.have.deep.property('invitations.guilds[0].id', group._id);
      await expect(userToInvite2.get('/user')).to.eventually.have.deep.property('invitations.guilds[0].id', group._id);
    });
  });

  describe('email invites', () => {
    let testInvite = {name: 'test', email: 'test@habitca.com'};

    it('returns an error when invite is missing an email', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        emails: [{name: 'test'}],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('inviteMissingEmail'),
      });
    });

    it('returns an error when emails is not an array', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        emails: {testInvite},
      }))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('emailsMustBeAnArray'),
      });
    });

    it('returns empty when emails is an empty array', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        emails: [],
      }))
      .to.eventually.be.empty;
    });

    it('invites a user to a group by email', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        emails: [testInvite],
      })).to.exist;
    });

    it('invites multiple users to a group by email', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`, {
        emails: [testInvite, {name: 'test2', email: 'test2@habitca.com'}],
      })).to.exist;
    });
  });

  describe('user and email invites', () => {
    it('returns an error when emails and uuids are not provided', async () => {
      await expect(inviter.post(`/groups/${group._id}/invite`))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('canOnlyInviteEmailUuid'),
      });
    });

    it('invites users to a group by uuid and email', async () => {
      let newUser = await generateUser();
      let invite = await inviter.post(`/groups/${group._id}/invite`, {
        uuids: [newUser._id],
        emails: [{name: 'test', email: 'test@habitca.com'}],
      });
      let invitedUser = await newUser.get('/user');

      expect(invite).to.exist;
      expect(invitedUser.invitations.guilds[0].id).to.equal(group._id);
    });
  });

  describe('guild invites', () => {
    it('returns an error when invited user is already invited to the group', async () => {
      let userToInivite = await generateUser();
      await inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInivite._id],
      });

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInivite._id],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('userAlreadyInvitedToGroup'),
      });
    });

    it('returns an error when invited user is already in the group', async () => {
      let userToInvite = await generateUser();
      await inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInvite._id],
      });
      await userToInvite.post(`/groups/${group._id}/join`);

      await expect(inviter.post(`/groups/${group._id}/invite`, {
        uuids: [userToInvite._id],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('userAlreadyInGroup'),
      });
    });
  });

  describe('party invites', () => {
    let party;

    beforeEach(async () => {
      party = await inviter.post('/groups', {
        name: 'Test Party',
        type: 'party',
      });
    });

    it('returns an error when invited user has a pending invitation to the party', async () => {
      let userToInvite = await generateUser();
      await inviter.post(`/groups/${party._id}/invite`, {
        uuids: [userToInvite._id],
      });

      await expect(inviter.post(`/groups/${party._id}/invite`, {
        uuids: [userToInvite._id],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('userAlreadyPendingInvitation'),
      });
    });

    it('returns an error when invited user is already in the party', async () => {
      let userToInvite = await generateUser();
      await inviter.post(`/groups/${party._id}/invite`, {
        uuids: [userToInvite._id],
      });
      await userToInvite.post(`/groups/${party._id}/join`);

      await expect(inviter.post(`/groups/${party._id}/invite`, {
        uuids: [userToInvite._id],
      }))
      .to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('userAlreadyInAParty'),
      });
    });
  });
});
